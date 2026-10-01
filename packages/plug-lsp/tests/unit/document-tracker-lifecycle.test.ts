import type { Logger } from '@wrongstack/core/types';
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

  it('keeps the total UTF-8 document budget under 32 MiB', async () => {
    const tracker = fixture();
    const text = 'ü'.repeat(1024 * 1024);
    for (let index = 0; index < 18; index++) await tracker.open(`file-${index}.ts`, text);
    expect(tracker.list()).toHaveLength(16);
    expect(tracker.get('file-0.ts')).toBeNull();
    expect(tracker.get('file-17.ts')).not.toBeNull();
  });

  it('rejects a file that grows beyond the cap between stat and read', async () => {
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
});
