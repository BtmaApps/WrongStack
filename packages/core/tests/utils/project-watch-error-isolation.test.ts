import * as path from 'node:path';
import { expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({
  watchers: [] as Array<{
    callback: (type: string, name: string | null) => void;
    handlers: Record<string, (error?: unknown) => void>;
    close: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('node:fs', () => ({
  watch: (_root: string, _opts: unknown, callback: (type: string, name: string | null) => void) => {
    const handlers: Record<string, (error?: unknown) => void> = {};
    const close = vi.fn();
    seam.watchers.push({ callback, handlers, close });
    return {
      on: (event: string, handler: (error?: unknown) => void) => {
        handlers[event] = handler;
      },
      close,
    };
  },
}));

import { watchProjectTree } from '../../src/utils/project-watch.js';

it('isolates subscriber error callbacks in ordinary, watcher-error and root-removal fanout', () => {
  for (const mode of ['listener', 'watcher', 'removed'] as const) {
    const root = path.resolve(`.temp_files/verify-watch-${mode}`);
    let good = 0;
    let errors = 0;
    const bad = watchProjectTree(
      root,
      () => {
        throw new Error('listener');
      },
      {
        onError: () => {
          throw new Error('error handler');
        },
      },
    );
    const goodSub = watchProjectTree(
      root,
      () => {
        good++;
      },
      {
        onError: () => {
          errors++;
        },
      },
    );
    const watcher = seam.watchers.at(-1)!;
    if (mode === 'listener') {
      expect(() => watcher.callback('change', 'a.ts')).not.toThrow();
      expect(() => watcher.callback('rename', null)).not.toThrow();
      expect(good).toBe(2);
      bad.close();
      watcher.callback('change', 'b.ts');
      expect(good).toBe(3);
    } else if (mode === 'watcher') {
      expect(() => watcher.handlers.error?.(new Error('EIO'))).not.toThrow();
      expect(errors).toBe(1);
    } else {
      expect(() => watcher.callback('rename', root)).not.toThrow();
      expect(errors).toBe(1);
      expect(watcher.close).toHaveBeenCalledOnce();
    }
    bad.close();
    goodSub.close();
  }
});
