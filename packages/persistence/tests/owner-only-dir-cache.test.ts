/**
 * Owner-only writes on Windows used to spawn `icacls` for EVERY file (~39 ms
 * vs ~3 ms per write). An eligible `.wrongstack` leaf directory is now given an
 * inheritable owner-only ACL once per directory identity, BEFORE the temp file
 * is created, and later writes there skip the per-file call. Anything else —
 * a directory with subdirectories or >200 entries, a non-.wrongstack path, a
 * failed hardening — keeps per-file icacls. icacls is stubbed through the
 * `_filePermOps` seam so this runs on every platform. (Re-hardening a
 * recreated directory is verified on real Windows in the audit scripts: POSIX
 * reuses inodes, so it cannot be asserted portably here.)
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPersistencePrimitives } from '../src/atomic-write.js';
import { _filePermOps } from '../src/file-permissions.js';

const original = { ..._filePermOps };
let base: string;
let calls: string[][];
let failDirHardening = false;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'owner-only-dir-'));
  calls = [];
  failDirHardening = false;
  _filePermOps.platform = 'win32';
  _filePermOps.userInfo = (() => ({ username: 'tester' })) as unknown as typeof os.userInfo;
  _filePermOps.execFileAsync = async (_file, args) => {
    calls.push([...args]);
    if (failDirHardening && args.some((arg) => arg.includes('(OI)(CI)'))) {
      throw new Error('icacls: access denied');
    }
    return { stdout: '', stderr: '' };
  };
});

afterEach(async () => {
  Object.assign(_filePermOps, original);
  await fs.rm(base, { recursive: true, force: true });
});

const dirCalls = () => calls.filter((args) => args.some((arg) => arg.includes('(OI)(CI)')));
const fileCalls = () => calls.filter((args) => !args.some((arg) => arg.includes('(OI)(CI)')));

async function writeMany(dir: string, count: number, mode = 0o600) {
  const primitives = createPersistencePrimitives();
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    await primitives.atomicWrite(path.join(dir, `f${i}.json`), '{}', { mode });
  }
}

describe('owner-only directory cache', () => {
  it('hardens an eligible .wrongstack leaf once and skips per-file icacls', async () => {
    await writeMany(path.join(base, '.wrongstack', 'store'), 5);
    expect(dirCalls()).toHaveLength(1);
    expect(fileCalls()).toHaveLength(0);
  });

  it('applies the same cache to the streaming writer', async () => {
    const dir = path.join(base, '.wrongstack', 'stream');
    await fs.mkdir(dir, { recursive: true });
    const primitives = createPersistencePrimitives();
    for (const name of ['a.log', 'b.log']) {
      await primitives.atomicReplaceWithWriter(
        path.join(dir, name),
        async (handle) => {
          await handle.writeFile('line\n');
        },
        { mode: 0o600 },
      );
    }
    expect(dirCalls()).toHaveLength(1);
    expect(fileCalls()).toHaveLength(0);
  });

  it('never hardens directories off Windows', async () => {
    _filePermOps.platform = 'linux';
    await writeMany(path.join(base, '.wrongstack', 'posix'), 2);
    expect(calls).toHaveLength(0);
  });

  it('keeps per-file icacls for a directory with subdirectories', async () => {
    const dir = path.join(base, '.wrongstack', 'nested');
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await writeMany(dir, 3);
    expect(dirCalls()).toHaveLength(0);
    expect(fileCalls()).toHaveLength(3);
  });

  it('keeps per-file icacls outside .wrongstack and for non-secret modes', async () => {
    await writeMany(path.join(base, 'plain'), 3);
    expect(dirCalls()).toHaveLength(0);
    expect(fileCalls()).toHaveLength(3);
    calls = [];
    await writeMany(path.join(base, '.wrongstack', 'public'), 3, 0o644);
    expect(calls).toHaveLength(0);
  });

  it('keeps per-file icacls for a directory with more than 200 entries', async () => {
    const dir = path.join(base, '.wrongstack', 'big');
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(
      Array.from({ length: 201 }, (_, i) => fs.writeFile(path.join(dir, `x${i}`), '')),
    );
    await writeMany(dir, 2);
    expect(dirCalls()).toHaveLength(0);
    expect(fileCalls()).toHaveLength(2);
  });

  it('falls back to per-file icacls when hardening the directory fails', async () => {
    failDirHardening = true;
    await writeMany(path.join(base, '.wrongstack', 'denied'), 3);
    expect(dirCalls()).toHaveLength(1);
    expect(fileCalls()).toHaveLength(3);
  });
});
