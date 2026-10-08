import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { treeKill } from '../../src/utils/tree-kill.js';

const REAL_PLATFORM = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

/** A fake taskkill process whose 'error' event can be emitted on demand. */
function fakeKiller(): EventEmitter & { unref: () => void } {
  const ee = new EventEmitter() as EventEmitter & { unref: () => void };
  ee.unref = vi.fn();
  return ee;
}

afterEach(() => {
  setPlatform(REAL_PLATFORM);
  spawnMock.mockReset();
  vi.useRealTimers();
});

describe('treeKill', () => {
  it('falls back to a graceful kill when pid is undefined', () => {
    const kill = vi.fn();
    treeKill({ pid: undefined, kill });
    // graceful default → no explicit signal (SIGTERM)
    expect(kill).toHaveBeenCalledWith(undefined);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('force + undefined pid sends SIGKILL directly', () => {
    const kill = vi.fn();
    treeKill({ pid: undefined, kill }, { force: true });
    expect(kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('on Windows spawns taskkill /T /F for the whole tree', () => {
    setPlatform('win32');
    spawnMock.mockReturnValue(fakeKiller());
    const kill = vi.fn();
    treeKill({ pid: 4321, kill });
    expect(spawnMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4321', '/T', '/F'],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it('on Windows falls back to child.kill() if taskkill errors, tolerating a dead child', () => {
    setPlatform('win32');
    const killer = fakeKiller();
    spawnMock.mockReturnValue(killer);
    const kill = vi.fn(() => {
      throw new Error('already gone');
    });
    treeKill({ pid: 42, kill });
    killer.emit('error', new Error('ENOENT'));
    expect(kill).toHaveBeenCalledTimes(1);
    expect(killer.unref).toHaveBeenCalledTimes(1);
  });

  it('on Windows falls back to child.kill() when spawning taskkill throws', () => {
    setPlatform('win32');
    spawnMock.mockImplementation(() => {
      throw new Error('spawn EACCES');
    });
    const kill = vi.fn();
    treeKill({ pid: 7, kill });
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('on Windows does not taskkill a PID after the child has exited', () => {
    // The PID may already belong to an unrelated process tree.
    setPlatform('win32');
    spawnMock.mockReturnValue(fakeKiller());
    treeKill({ pid: 4321, exitCode: 0, kill: vi.fn() });
    treeKill({ pid: 4322, exitCode: 1, kill: vi.fn() }, { force: true });
    treeKill({ pid: 4324, exitCode: null, signalCode: 'SIGTERM', kill: vi.fn() });
    expect(spawnMock).not.toHaveBeenCalled();
    treeKill({ pid: 4323, exitCode: null, kill: vi.fn() });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('on POSIX sends SIGTERM then a SIGKILL backstop', () => {
    setPlatform('linux');
    vi.useFakeTimers();
    const kill = vi.fn();
    treeKill({ pid: 99, kill });
    expect(kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(spawnMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('on POSIX with force sends SIGKILL immediately and skips the backstop', () => {
    setPlatform('linux');
    vi.useFakeTimers();
    const kill = vi.fn();
    treeKill({ pid: 5, kill }, { force: true });
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    vi.advanceTimersByTime(5000);
    expect(kill).toHaveBeenCalledTimes(1); // no backstop
  });

  it('honors a custom graceMs for the POSIX backstop', () => {
    setPlatform('linux');
    vi.useFakeTimers();
    const kill = vi.fn();
    treeKill({ pid: 3, kill }, { graceMs: 500 });
    expect(kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    vi.advanceTimersByTime(499);
    expect(kill).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });
});
