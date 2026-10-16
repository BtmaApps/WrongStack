import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({
  file: '',
  active: false,
  saveEntered: () => {},
  waitSave: async () => {},
  clearProgress: () => {},
}));
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      try {
        return await real.open(...args);
      } catch (error) {
        const lock = join(dirname(seam.file), `.${basename(seam.file)}.lock`);
        if (
          seam.active &&
          String(args[0]) === lock &&
          (error as NodeJS.ErrnoException).code === 'EEXIST'
        )
          seam.clearProgress();
        throw error;
      }
    },
    rename: async (
      from: Parameters<typeof real.rename>[0],
      to: Parameters<typeof real.rename>[1],
    ) => {
      let clearing = false;
      if (seam.active && String(to) === seam.file) {
        const payload = JSON.parse(await real.readFile(from, 'utf8'));
        if (payload.entries.includes('pending')) {
          seam.saveEntered();
          await seam.waitSave();
        } else if (payload.entries.length === 0) clearing = true;
      }
      await real.rename(from, to);
      if (clearing) seam.clearProgress();
    },
  };
});
import { InputHistoryStore } from '../../src/storage/input-history-store.js';

const roots: string[] = [];
const scrubber = { scrub: (value: string) => value, scrubObject: <T>(value: T) => value };
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'wrongstack-history-clear-'));
  roots.push(root);
  const file = join(root, 'input-history.json');
  return { root, file, store: new InputHistoryStore(file, scrubber) };
}
afterEach(async () => {
  seam.active = false;
  for (const root of roots.splice(0)) {
    expect(resolve(root).startsWith(join(tmpdir(), 'wrongstack-history-clear-'))).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe('input history clear ordering', () => {
  it.each([false, true])(
    'does not resurrect a save started before clear (peer=%s)',
    async (peer) => {
      const { file, store } = await fixture();
      await store.save(['control']);
      await store.clear();
      expect(await store.load()).toEqual([]);
      const clearer = peer ? new InputHistoryStore(file, scrubber) : store;
      const entered = gate(),
        completion = gate(),
        progress = gate();
      seam.file = file;
      seam.active = true;
      seam.saveEntered = entered.release;
      seam.waitSave = () => completion.promise;
      seam.clearProgress = progress.release;
      const saving = store.save(['pending']);
      await entered.promise;
      const clearing = clearer.clear();
      await progress.promise;
      completion.release();
      await Promise.all([saving, clearing]);
      seam.active = false;
      expect(await store.load()).toEqual([]);
    },
  );
  it('clears a missing file and releases the lock', async () => {
    const { root, store } = await fixture();
    await store.clear();
    expect(await store.load()).toEqual([]);
    expect(await fs.readdir(root)).toEqual(['input-history.json']);
  });
  it('accepts a fresh save after repeated clears', async () => {
    const { store } = await fixture();
    await store.save(['old']);
    await store.clear();
    await store.clear();
    await store.save(['new']);
    expect(await store.load()).toEqual(['new']);
  });
});
