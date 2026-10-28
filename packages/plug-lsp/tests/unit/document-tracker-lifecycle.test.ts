import type { Logger } from '@wrongstack/contracts/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ stat: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  ...files,
}));

import { DocumentTracker } from '../../src/document-tracker.js';

function fixture() {
  return new DocumentTracker(
    () => ({ list: () => [] }),
    { debug: vi.fn() } as unknown as Logger,
    process.cwd(),
  );
}
beforeEach(() => {
  files.stat.mockReset().mockResolvedValue({ isFile: () => true, size: 1 });
  files.readFile.mockReset().mockResolvedValue('fixture');
});

describe('document tracker byte and lifetime limits', () => {
  for (const [character, bytes] of [
    ['ü', 2],
    ['界', 3],
    ['😀', 4],
  ] as const) {
    it(`checks UTF-8 bytes for caller-supplied ${bytes}-byte characters`, async () => {
      const tracker = fixture();
      const text = character.repeat(Math.floor((2 * 1024 * 1024) / bytes) + 1);
      expect(await tracker.open('large.ts', text)).toBe(false);
      expect(tracker.list()).toHaveLength(0);
    });
  }

  it('keeps the total UTF-8 document budget under 32 MiB and respects LRU touch order and MAX_TRACKED_DOCS', async () => {
    let now = 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++now);
    try {
      const tracker = fixture();
      const text = 'ü'.repeat(1024 * 1024);
      for (let index = 0; index < 16; index++) await tracker.open(`file-${index}.ts`, text);
      // Re-touch file-0 so file-1 becomes the oldest LRU entry
      await tracker.open('file-0.ts', text);
      await tracker.open('file-16.ts', text);
      expect(tracker.list()).toHaveLength(16);
      expect(tracker.get('file-0.ts')).not.toBeNull();
      expect(tracker.get('file-1.ts')).toBeNull();
      expect(tracker.get('file-16.ts')).not.toBeNull();

      const countTracker = fixture();
      for (let i = 0; i < 202; i++) await countTracker.open(`small-${i}.ts`, 'x');
      expect(countTracker.list()).toHaveLength(200);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('rejects a file whose stat.size exceeds MAX_DOCUMENT_BYTES without reading it, or that grows between stat and read', async () => {
    files.stat.mockResolvedValueOnce({ isFile: () => true, size: 2 * 1024 * 1024 + 1 });
    expect(await fixture().open('stat-too-big.ts')).toBe(false);
    expect(files.readFile).not.toHaveBeenCalled();

    files.readFile.mockResolvedValue('x'.repeat(2 * 1024 * 1024 + 1));
    expect(await fixture().open('growing.ts')).toBe(false);
  });

  for (const operation of ['open', 'fileWritten'] as const) {
    it(`${operation}: pending reads cannot restore documents after forceCloseAll`, async () => {
      let release!: (text: string) => void;
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const read = new Promise<string>((resolve) => {
        release = resolve;
      });
      files.readFile.mockImplementationOnce(() => {
        entered();
        return read;
      });
      const tracker = fixture();
      const pending = tracker[operation]('late.ts');
      await ready;
      await tracker.forceCloseAll();
      release('late content');
      await pending;
      expect(tracker.list()).toHaveLength(0);
      expect(await tracker.open('new.ts', 'fresh')).toBe(true);
    });
  }

  it('evicts already-tracked documents and notifies clients when fileWritten or open encounters an oversized or deleted file (F159)', async () => {
    const notifyDidClose = vi.fn();
    const fakeServer = {
      name: 'ts',
      state: 'ready' as const,
      config: { languages: ['typescript'] },
      notifyDidOpen: vi.fn(),
      notifyDidChange: vi.fn(),
      notifyDidClose,
    };
    const tracker = new DocumentTracker(
      () => ({ list: () => [fakeServer as never] }),
      { debug: vi.fn() } as unknown as Logger,
      process.cwd(),
    );

    expect(await tracker.open('tracked.ts', 'const x = 1;')).toBe(true);
    expect(tracker.get('tracked.ts')?.text).toBe('const x = 1;');

    files.stat.mockResolvedValueOnce({ isFile: () => true, size: 2 * 1024 * 1024 + 10 });
    await tracker.fileWritten('tracked.ts');
    expect(tracker.get('tracked.ts')).toBeNull();
    expect(notifyDidClose).toHaveBeenCalledTimes(1);

    expect(await tracker.open('deleted.ts', 'const y = 2;')).toBe(true);
    files.stat.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await tracker.open('deleted.ts')).toBe(false);
    expect(tracker.get('deleted.ts')).toBeNull();
    expect(notifyDidClose).toHaveBeenCalledTimes(2);
  });

  it('sends didOpen instead of didChange when a server with the same name no longer has the document open (F758)', async () => {
    const makeServer = () => {
      const openUris = new Set<string>();
      const events: string[] = [];
      return {
        openUris,
        events,
        server: {
          name: 'ts',
          state: 'ready' as const,
          config: { languages: ['typescript'] },
          hasOpenDocument: (uri: string) => openUris.has(uri),
          notifyDidOpen: (doc: { uri: string; version: number; text: string }) => {
            openUris.add(doc.uri);
            events.push(`didOpen:${doc.version}:${doc.text}`);
          },
          notifyDidChange: (doc: { uri: string; version: number }, text: string) => {
            events.push(`didChange:${doc.version}:${text}`);
          },
          notifyDidClose: (uri: string) => {
            openUris.delete(uri);
            events.push(`didClose:${uri}`);
          },
        },
      };
    };

    const s1 = makeServer();
    let active = [s1.server];
    const tracker = new DocumentTracker(
      () => ({ list: () => active as never }),
      { debug: vi.fn() } as unknown as Logger,
      process.cwd(),
    );

    expect(await tracker.open('reopened.ts', 'v1')).toBe(true);
    expect(s1.events).toEqual(['didOpen:1:v1']);

    const s2 = makeServer();
    active = [s2.server];
    files.readFile.mockResolvedValueOnce('v2');
    await tracker.fileWritten('reopened.ts');
    expect(s2.events).toEqual(['didOpen:2:v2']);

    s2.openUris.clear();
    s2.events.length = 0;
    expect(await tracker.open('reopened.ts', 'v3')).toBe(true);
    expect(s2.events).toEqual(['didOpen:3:v3']);
  });
});
