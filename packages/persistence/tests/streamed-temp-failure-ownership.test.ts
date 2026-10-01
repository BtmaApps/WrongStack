import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ code: undefined as string | undefined }));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomBytes: () => Buffer.from('aaaaaaaaaaaaaaaaaaaa', 'hex'),
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      if (args[1] === 'wx' && fault.code)
        throw Object.assign(new Error('fixture open failure'), { code: fault.code });
      return actual.open(...args);
    },
  };
});

import { createPersistencePrimitives } from '../src/atomic-write.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'streamed-owner-'));
  fault.code = undefined;
});
afterEach(async () => {
  fault.code = undefined;
  await fs.rm(root, { recursive: true, force: true });
});

describe('streamed temp ownership after open failure', () => {
  for (const code of ['EACCES', 'EPERM', 'EBUSY', 'EIO', 'ENOSPC', 'ENOENT', 'EEXIST']) {
    it(`${code}: never removes a temp file whose exclusive open did not succeed`, async () => {
      const target = path.join(root, 'target.txt');
      const foreign = path.join(root, '.target.txt.aaaaaaaaaaaaaaaaaaaa.tmp');
      await fs.writeFile(target, 'original');
      await fs.writeFile(foreign, 'foreign');
      fault.code = code;
      const write = vi.fn();
      await expect(
        createPersistencePrimitives().atomicReplaceWithWriter(target, write),
      ).rejects.toMatchObject({ code });
      expect(write).not.toHaveBeenCalled();
      await expect(fs.readFile(foreign, 'utf8')).resolves.toBe('foreign');
      await expect(fs.readFile(target, 'utf8')).resolves.toBe('original');
    });
  }

  it('commits its own temp and returns the writer result', async () => {
    const target = path.join(root, 'target.txt');
    const result = await createPersistencePrimitives().atomicReplaceWithWriter(
      target,
      async (handle) => {
        await handle.writeFile('ours');
        return 42;
      },
    );
    expect(result).toBe(42);
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('ours');
  });

  for (const code of ['EIO', 'EEXIST']) {
    it(`cleans up an owned temp when the writer later fails with ${code}`, async () => {
      const target = path.join(root, 'target.txt');
      await fs.writeFile(target, 'original');
      await expect(
        createPersistencePrimitives().atomicReplaceWithWriter(target, async () => {
          throw Object.assign(new Error('writer failed'), { code });
        }),
      ).rejects.toMatchObject({ code });
      await expect(fs.readFile(target, 'utf8')).resolves.toBe('original');
      expect(await fs.readdir(root)).toEqual(['target.txt']);
    });
  }
});
