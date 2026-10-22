import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ duringSwap: undefined as (() => void) | undefined }));

vi.mock('../src/standalone-update.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/standalone-update.js')>();
  return {
    ...real,
    installExecutableFrom: (...args: Parameters<typeof real.installExecutableFrom>) => {
      hooks.duringSwap?.();
      return real.installExecutableFrom(...args);
    },
  };
});

const { standaloneUpdater } = await import('../src/standalone-auto-update.js');

const DEAD_PID = 2 ** 22 + 7;
let root: string;
let dir: string;
let exe: string;
let lock: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-autoupdate-race-'));
  dir = path.join(root, 'updates');
  fs.mkdirSync(dir);
  exe = path.join(root, 'wstack.exe');
  fs.writeFileSync(exe, 'old build');
  const file = path.join(dir, '1.0.26-wstack.exe');
  fs.writeFileSync(file, 'new build');
  fs.writeFileSync(
    path.join(dir, 'pending.json'),
    JSON.stringify({
      version: '1.0.26',
      file,
      sha256: createHash('sha256').update('new build').digest('hex'),
      target: 'bun-windows-x64',
      executable: exe,
      stagedAt: '',
    }),
  );
  lock = path.join(dir, 'update.lock');
});
afterEach(() => {
  hooks.duringSwap = undefined;
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const apply = () =>
  standaloneUpdater({ dir, executable: exe, target: 'bun-windows-x64', current: '0.0.0' }).apply();
const liveLock = JSON.stringify({ pid: process.pid, at: Date.now(), owner: 'other session' });

describe('standalone update lock', () => {
  it('does not delete a lock another session took after this one judged the old one stale', () => {
    fs.writeFileSync(lock, JSON.stringify({ pid: DEAD_PID, at: Date.now() }));
    const realKill = process.kill.bind(process);
    let interleaved = false;
    vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
      if (pid !== DEAD_PID) return realKill(pid, signal);
      // Between this session's read of the stale lock and its break, another
      // session breaks the same lock and takes its own.
      if (!interleaved) {
        interleaved = true;
        fs.rmSync(lock, { force: true });
        fs.writeFileSync(lock, liveLock, { flag: 'wx' });
      }
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    }) as typeof process.kill);

    expect(apply()).toBeUndefined();
    expect(fs.readFileSync(lock, 'utf8')).toBe(liveLock);
    expect(fs.readFileSync(exe, 'utf8')).toBe('old build');
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('update.lock'))).toEqual([
      'update.lock',
    ]);
  });

  it('releases only its own lock, not one that replaced it during the swap', () => {
    hooks.duringSwap = () => {
      fs.rmSync(lock, { force: true });
      fs.writeFileSync(lock, liveLock, { flag: 'wx' });
    };
    expect(apply()).toBe('1.0.26');
    expect(fs.readFileSync(lock, 'utf8')).toBe(liveLock);
  });
});
