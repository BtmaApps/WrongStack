/**
 * Failure branches of the owner-only directory cache that real directories
 * cannot reach on demand: the directory cannot be stat'ed or listed. Either
 * way the write must still succeed through per-file icacls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => {
  const handle = { sync: vi.fn(), close: vi.fn() };
  const fs = {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    open: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    chmod: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
  };
  return { fs, handle };
});

vi.mock('node:fs/promises', () => doubles.fs);

import { createPersistencePrimitives } from '../src/atomic-write.js';
import { _filePermOps } from '../src/file-permissions.js';

const original = { ..._filePermOps };
let calls: string[][];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  _filePermOps.platform = 'win32';
  _filePermOps.userInfo = (() => ({
    username: 'tester',
  })) as unknown as typeof _filePermOps.userInfo;
  _filePermOps.execFileAsync = async (_file, args) => {
    calls.push([...args]);
    return { stdout: '', stderr: '' };
  };
  doubles.fs.mkdir.mockResolvedValue(undefined);
  doubles.fs.writeFile.mockResolvedValue(undefined);
  doubles.fs.open.mockResolvedValue(doubles.handle);
  doubles.handle.sync.mockResolvedValue(undefined);
  doubles.handle.close.mockResolvedValue(undefined);
  doubles.fs.chmod.mockResolvedValue(undefined);
  doubles.fs.rename.mockResolvedValue(undefined);
  doubles.fs.unlink.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.assign(_filePermOps, original);
});

const target = '/home/u/.wrongstack/store/secret.json';

describe('owner-only directory cache failure branches', () => {
  it('uses per-file icacls when the directory cannot be stat-ed', async () => {
    doubles.fs.stat.mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    await createPersistencePrimitives().atomicWrite(target, '{}', { mode: 0o600 });
    expect(doubles.fs.readdir).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.some((arg) => arg.includes('(OI)(CI)'))).toBe(false);
  });

  it('uses per-file icacls when the directory cannot be listed', async () => {
    doubles.fs.stat.mockImplementation(async (file: string) =>
      file.endsWith('store')
        ? { ino: 1, birthtimeMs: 1, mode: 0o40700 }
        : Promise.reject(Object.assign(new Error('no'), { code: 'ENOENT' })),
    );
    doubles.fs.readdir.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await createPersistencePrimitives().atomicWrite(target, '{}', { mode: 0o600 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.some((arg) => arg.includes('(OI)(CI)'))).toBe(false);
  });
});
