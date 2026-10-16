import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ read: vi.fn(), watch: vi.fn() }));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readFile: seam.read,
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  watch: seam.watch,
}));
import { watchProviderConfig } from '../../src/storage/provider-config-watcher.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  seam.read.mockReset();
  seam.watch.mockReset();
});

function fixture() {
  vi.useFakeTimers();
  const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
  seam.watch.mockReturnValue(watcher);
  const seen: string[] = [];
  const handle = watchProviderConfig(
    '/proof/config.json',
    {} as never,
    (s) => {
      seen.push(s.uiLocale ?? '');
    },
    { debounceMs: 1 },
  );
  return { watcher, handle, seen };
}

describe('provider config read ordering', () => {
  it('ignores an older read that finishes after a newer snapshot', async () => {
    let release!: (raw: string) => void;
    seam.read
      .mockResolvedValueOnce('{}')
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            release = r;
          }),
      )
      .mockResolvedValueOnce('{"uiLocale":"new"}');
    const { watcher, handle, seen } = fixture();
    try {
      await vi.advanceTimersByTimeAsync(0);
      watcher.emit('change', 'change', 'config.json');
      await vi.advanceTimersByTimeAsync(1);
      expect(seam.read).toHaveBeenCalledTimes(2);
      watcher.emit('change', 'change', 'config.json');
      await vi.advanceTimersByTimeAsync(1);
      expect(seen).toEqual(['new']);
      release('{"uiLocale":"old"}');
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual(['new']);
    } finally {
      handle.close();
    }
  });

  it('does not publish an in-flight read after close', async () => {
    let release!: (raw: string) => void;
    seam.read.mockResolvedValueOnce('{}').mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    const { watcher, handle, seen } = fixture();
    await vi.advanceTimersByTimeAsync(0);
    watcher.emit('change', 'change', 'config.json');
    await vi.advanceTimersByTimeAsync(1);
    handle.close();
    release('{"uiLocale":"late"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([]);
    expect(watcher.close).toHaveBeenCalledTimes(1);
  });

  it('suppresses repeated identical snapshots', async () => {
    seam.read.mockResolvedValueOnce('{}').mockResolvedValue('{"uiLocale":"new"}');
    const { watcher, handle, seen } = fixture();
    try {
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 2; i++) {
        watcher.emit('change', 'change', 'config.json');
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(seen).toEqual(['new']);
    } finally {
      handle.close();
    }
  });
});
