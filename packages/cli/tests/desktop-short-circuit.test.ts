import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  desktopExecutableCandidates,
  handleDesktopShortCircuit,
  selectDesktopLauncherExecutable,
  stripDesktopLauncherArgs,
} from '../src/boot/short-circuit-desktop.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  statSync: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('desktop short-circuit', () => {
  it('automatically launches the installed native app when no override is set', async () => {
    vi.stubEnv('WRONGSTACK_DESKTOP_EXECUTABLE', '');
    const candidate = desktopExecutableCandidates(process.platform, homedir(), process.env).at(-1);
    vi.mocked(statSync).mockImplementation((file) => {
      if (file !== candidate) throw new Error('ENOENT');
      return { isFile: () => true } as ReturnType<typeof statSync>;
    });
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const result = handleDesktopShortCircuit({ desktop: true }, ['desktop', '--open']);
    expect(spawn).toHaveBeenCalledWith(candidate, ['--open'], expect.any(Object));
    child.emit('exit', 0, null);
    expect(await result).toBe(0);
  });

  it('rejects relative executable overrides', async () => {
    vi.stubEnv('WRONGSTACK_DESKTOP_EXECUTABLE', './WrongStack');
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await handleDesktopShortCircuit({ desktop: true }, ['desktop'])).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('launches a native Desktop without Node or the npm launcher, preserving arguments and exit code', async () => {
    const executable = path.resolve('Desktop With Spaces', 'WrongStack.exe');
    vi.stubEnv('WRONGSTACK_DESKTOP_EXECUTABLE', executable);
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1');
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const result = handleDesktopShortCircuit({ desktop: true }, [
      '--desktop',
      '--open',
      'project with spaces',
    ]);
    expect(spawn).toHaveBeenCalledWith(
      executable,
      ['--open', 'project with spaces'],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.not.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
      }),
    );
    child.emit('exit', 7, null);
    expect(await result).toBe(7);
  });

  it('reports native launch errors', async () => {
    vi.stubEnv('WRONGSTACK_DESKTOP_EXECUTABLE', path.resolve('WrongStack.exe'));
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as ReturnType<typeof statSync>);
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const result = handleDesktopShortCircuit({ desktop: true }, ['desktop']);
    child.emit('error', new Error('permission denied'));
    expect(await result).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
  });

  it('rejects a missing explicit executable instead of silently launching another installation', async () => {
    vi.stubEnv('WRONGSTACK_DESKTOP_EXECUTABLE', path.resolve('missing.exe'));
    vi.mocked(statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await handleDesktopShortCircuit({ desktop: true }, ['desktop'])).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does not launch when Desktop was not selected', async () => {
    expect(await handleDesktopShortCircuit({}, [])).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('finds standard installations on each supported platform', () => {
    expect(
      desktopExecutableCandidates('win32', 'C:\\Users\\person', { LOCALAPPDATA: 'D:\\Local' }),
    ).toContain('D:\\Local\\Programs\\WrongStack\\WrongStack.exe');
    expect(desktopExecutableCandidates('darwin', '/Users/person', {})).toContain(
      '/Applications/WrongStack.app/Contents/MacOS/WrongStack',
    );
    expect(desktopExecutableCandidates('linux', '/home/person', {})).toContain(
      '/home/person/.wrongstack/desktop/WrongStack.AppImage',
    );
  });
  it('strips the flag form before forwarding args to the desktop package', () => {
    expect(stripDesktopLauncherArgs(['--desktop', '--open'])).toEqual(['--open']);
  });

  it('strips the subcommand form before forwarding args to the desktop package', () => {
    expect(stripDesktopLauncherArgs(['desktop', '--inspect'])).toEqual(['--inspect']);
  });

  it('uses Node for the Electron launcher when the CLI is running under Bun', () => {
    expect(selectDesktopLauncherExecutable('C:\\tools\\bun.exe', true)).toBe('node');
    expect(selectDesktopLauncherExecutable('C:\\tools\\bun.exe', true, 'D:\\node\\node.exe')).toBe(
      'D:\\node\\node.exe',
    );
  });

  it('keeps the current executable outside Bun', () => {
    expect(selectDesktopLauncherExecutable('C:\\node\\node.exe', false)).toBe('C:\\node\\node.exe');
  });
});
