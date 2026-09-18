/**
 * --desktop short-circuit.
 *
 * Starts the Electron desktop shell before the normal project boot path. This
 * keeps `wstack --desktop` and `wstack desktop` project-independent, matching
 * `--hq`.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { color } from '@wrongstack/core/utils';

export function desktopExecutableCandidates(
  platform: string,
  home: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  const managed = join(home, '.wrongstack', 'desktop');
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] || join(home, 'AppData', 'Local');
    return [
      join(managed, 'WrongStack.exe'),
      join(local, 'Programs', 'WrongStack', 'WrongStack.exe'),
    ];
  }
  if (platform === 'darwin') {
    return [
      join(managed, 'WrongStack.app', 'Contents', 'MacOS', 'WrongStack'),
      join(home, 'Applications', 'WrongStack.app', 'Contents', 'MacOS', 'WrongStack'),
      '/Applications/WrongStack.app/Contents/MacOS/WrongStack',
    ];
  }
  if (platform === 'linux') {
    return [join(managed, 'WrongStack.AppImage'), '/opt/WrongStack/wrongstack-desktop'];
  }
  return [];
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function stripDesktopLauncherArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--desktop' || arg.startsWith('--desktop=')) continue;
    if (i === 0 && arg === 'desktop') continue;
    out.push(arg);
  }
  return out;
}

export function selectDesktopLauncherExecutable(
  execPath: string,
  runningUnderBun: boolean,
  nodeOverride?: string,
): string {
  if (!runningUnderBun) return execPath;
  return nodeOverride?.trim() || 'node';
}

export async function handleDesktopShortCircuit(
  flags: Record<string, string | boolean>,
  argv: string[],
): Promise<number | null> {
  if (flags['desktop'] !== true) return null;
  return launchDesktop(stripDesktopLauncherArgs(argv));
}

async function launchDesktop(args: string[]): Promise<number> {
  const override = process.env['WRONGSTACK_DESKTOP_EXECUTABLE']?.trim();
  if (override && (!path.isAbsolute(override) || !isFile(override))) {
    process.stderr.write(
      'WRONGSTACK_DESKTOP_EXECUTABLE must point to an existing absolute executable path.\n',
    );
    return 1;
  }
  const native =
    override || desktopExecutableCandidates(process.platform, homedir(), process.env).find(isFile);
  let executable = native;
  let launchArgs = args;
  if (!executable)
    try {
      // Retain workspace/npm installs as a compatibility fallback. A compiled
      // Bun executable can reject import.meta.url, so createRequire belongs here.
      const req = createRequire(import.meta.url);
      const desktopPkgPath = req.resolve('@wrongstack/desktop/package.json');
      launchArgs = [
        path.join(path.dirname(desktopPkgPath), 'bin', 'wrongstack-desktop.js'),
        ...args,
      ];
      executable = selectDesktopLauncherExecutable(
        process.execPath,
        typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined',
        process.env['NODE'],
      );
    } catch {
      process.stderr.write(
        [
          color.red('✗ WrongStack Desktop is not installed.'),
          '',
          'Download WrongStack Desktop from GitHub Releases:',
          '  https://github.com/WrongStack/WrongStack/releases/latest',
          '',
          'For a portable or custom installation, set WRONGSTACK_DESKTOP_EXECUTABLE',
          'to the absolute path of the Desktop executable (on macOS: WrongStack.app/Contents/MacOS/WrongStack).',
          '',
        ].join('\n'),
      );
      return 1;
    }

  return await new Promise<number>((resolve) => {
    const env = { ...process.env };
    if (native) delete env['ELECTRON_RUN_AS_NODE'];
    const child = spawn(executable, launchArgs, {
      stdio: 'inherit',
      env,
      windowsHide: false,
    });
    child.once('error', (err) => {
      process.stderr.write(
        `${color.red('✗ Failed to start WrongStack Desktop:')} ${err.message}\n`,
      );
      resolve(1);
    });
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') resolve(code);
      else resolve(signal ? 1 : 0);
    });
  });
}
