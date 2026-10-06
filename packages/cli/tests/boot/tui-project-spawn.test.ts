/**
 * Tests for boot/tui-project-spawn.ts — the post-TUI successor spawn that
 * hands the terminal to a new wstack in the switched-to project.
 */
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleProjectSwitchSpawn } from '../../src/boot/tui-project-spawn.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const child = { on: vi.fn(), unref: vi.fn() };

beforeEach(() => {
  vi.mocked(spawn).mockReturnValue(child as never);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('handleProjectSwitchSpawn', () => {
  it('returns null without spawning when the TUI exited with a non-switch code', async () => {
    const result = await handleProjectSwitchSpawn({
      code: 0,
      pendingProjectSwitch: { root: '/tmp/other', name: 'other' },
    });
    expect(result).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns null without spawning when exit code 42 carries no pending switch', async () => {
    const result = await handleProjectSwitchSpawn({ code: 42, pendingProjectSwitch: null });
    expect(result).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('spawns a detached, hidden, unref’d successor in the target root and returns 0', async () => {
    const result = await handleProjectSwitchSpawn({
      code: 42,
      pendingProjectSwitch: { root: '/tmp/other', name: 'other', resumeSessionId: 'sess-1' },
    });

    expect(result).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [exe, args, opts] = vi.mocked(spawn).mock.calls[0]!;
    expect(exe).toBe(process.execPath);
    expect(args).toContain('--no-interactive');
    expect(args.slice(-2)).toEqual(['--resume', 'sess-1']);
    expect(opts).toMatchObject({
      cwd: '/tmp/other',
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('omits --resume when the switch names no session', async () => {
    await handleProjectSwitchSpawn({
      code: 42,
      pendingProjectSwitch: { root: '/tmp/other', name: 'other' },
    });
    const [, args] = vi.mocked(spawn).mock.calls[0]!;
    expect(args).not.toContain('--resume');
  });
});
