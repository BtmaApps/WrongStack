import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  spawn: vi.fn(),
  standalone: false,
  updateBinary: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../src/update-check.js', () => ({ checkForUpdate: mocks.check }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
// Vite does not implement Bun/esbuild's text import attribute. The real
// installer scripts are exercised by standalone-migration-installer.test.ts.
vi.mock('../../../scripts/install.ps1', () => ({ default: '# installer fixture' }));
vi.mock('../../../scripts/install.sh', () => ({ default: '# installer fixture' }));
vi.mock('@wrongstack/core/utils', async (original) => ({
  ...(await original<typeof import('@wrongstack/core/utils')>()),
  isStandaloneBinary: () => mocks.standalone,
}));
vi.mock('../src/standalone-update.js', () => ({ updateStandaloneBinary: mocks.updateBinary }));
vi.mock('../src/standalone-auto-update.js', () => ({
  standaloneUpdater: () => ({ pending: () => undefined, clear: mocks.clear }),
}));

import {
  detectUpdatePackageManager,
  detectUpdatePackageName,
  runUpdateCommand,
} from '../src/subcommands/handlers/update.js';

let output: string;
const deps = {
  cwd: process.cwd(),
  userHome: process.cwd(),
  renderer: {
    write: (s: string) => {
      output += s;
    },
  },
};

beforeEach(() => {
  output = '';
  mocks.standalone = false;
  mocks.updateBinary.mockResolvedValue(0);
  mocks.check.mockResolvedValue({
    current: '1.0.0',
    latest: '1.2.3',
    outdated: true,
    checkFailed: false,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# installer fixture')));
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    setImmediate(() => child.emit('close', 0, null));
    return child;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('binary-only update policy', () => {
  it('retains package detection for HQ service consumers', () => {
    expect(detectUpdatePackageManager({ WRONGSTACK_UPDATE_PM: 'pnpm' }, [])).toBe('pnpm');
    expect(
      detectUpdatePackageManager({ npm_config_user_agent: 'yarn/1.22.22 npm/? node/v24' }, []),
    ).toBe('yarn');
    expect(
      detectUpdatePackageManager({ npm_config_user_agent: 'bun/1.2.0 npm/? node/v24' }, []),
    ).toBe('bun');
    expect(
      detectUpdatePackageName(['node', 'C:\\x\\node_modules\\@wrongstack\\cli\\dist\\index.js']),
    ).toBe('@wrongstack/cli');
    expect(
      detectUpdatePackageName(['node', 'C:\\x\\node_modules\\wrongstack\\src\\index.js']),
    ).toBe('wrongstack');
  });
  it.each(
    [[], ['--npm'], ['--pm', 'pnpm'], ['--yarn'], ['--bun'], ['--allow-scripts']].map((args) => ({
      args,
    })),
  )(
    'migrates through the release installer instead of a package update: $args',
    async ({ args }) => {
      expect(await runUpdateCommand(args, deps)).toBe(0);
      expect(output).toContain('Warning:');
      expect(output).toContain('GitHub Releases');
      expect(mocks.check).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'github-releases' }),
      );
      const [exe, , options] = mocks.spawn.mock.calls.at(-1)!;
      expect(exe).not.toMatch(/^(npm|pnpm|yarn|bun)(\.cmd)?$/);
      expect(options.env).toMatchObject({ WSTACK_VERSION: '1.2.3', WSTACK_MIGRATION: '1' });
    },
  );

  it('migrates even when the package version is already current', async () => {
    mocks.check.mockResolvedValue({
      current: '1.2.3',
      latest: '1.2.3',
      outdated: false,
      checkFailed: false,
    });
    expect(await runUpdateCommand([], deps)).toBe(0);
    expect(mocks.spawn).toHaveBeenCalled();
  });

  it('check-only does not install or uninstall anything', async () => {
    expect(await runUpdateCommand(['--check-only'], deps)).toBe(0);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(output).toContain('Update available');
  });

  it('preserves the parser-expanded -c check-only alias', async () => {
    expect(await runUpdateCommand([], { ...deps, flags: { continue: true } })).toBe(0);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('ignores parsed package-manager flags without enabling package updates', async () => {
    expect(
      await runUpdateCommand([], { ...deps, flags: { pm: 'npm', 'allow-scripts': true } }),
    ).toBe(0);
    expect(output).toContain('options are ignored');
    expect(mocks.spawn.mock.calls.at(-1)![0]).not.toBe('npm');
  });

  it.each([['--force'], ['--pm', 'pip']])('rejects invalid options %j', async (...args) => {
    expect(await runUpdateCommand(args, deps)).toBe(1);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('fails closed on an unavailable GitHub release', async () => {
    mocks.check.mockResolvedValue({
      current: '1.0.0',
      latest: '1.0.0',
      outdated: false,
      checkFailed: true,
    });
    expect(await runUpdateCommand([], deps)).toBe(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(output).toContain('Update check failed for GitHub Releases');
  });

  it('does not run an installer for an invalid release version', async () => {
    mocks.check.mockResolvedValue({
      current: '1.0.0',
      latest: '../bad',
      outdated: true,
      checkFailed: false,
    });
    expect(await runUpdateCommand([], deps)).toBe(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(output).toContain('Binary migration failed');
  });

  it('uses the bundled installer, pins the binary version and clears inherited mirror settings', async () => {
    vi.stubEnv('WSTACK_DOWNLOAD_BASE', 'https://example.invalid');
    vi.stubEnv('WSTACK_NO_MODIFY_PATH', '1');
    vi.stubEnv('WSTACK_INSTALL_DIR', '/old/node_modules/wrongstack');
    let scriptPath = '';
    mocks.spawn.mockImplementationOnce((_exe, args, opts) => {
      scriptPath = args.at(-1);
      expect(readFileSync(scriptPath, 'utf8')).toBe('# installer fixture');
      expect(opts.env.WSTACK_DOWNLOAD_BASE).toBeUndefined();
      expect(opts.env.WSTACK_NO_MODIFY_PATH).toBeUndefined();
      expect(opts.env.WSTACK_INSTALL_DIR).toContain('.wrongstack');
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      });
      setImmediate(() => child.emit('close', 0, null));
      return child;
    });
    expect(await runUpdateCommand([], deps)).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(scriptPath)).toBe(false);
  });

  it.each([
    { code: 17, signal: null },
    { code: null, signal: 'SIGTERM' },
  ])('reports installer failure: $code/$signal', async ({ code, signal }) => {
    mocks.spawn.mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      });
      setImmediate(() => child.emit('close', code, signal));
      return child;
    });
    expect(await runUpdateCommand([], deps)).toBe(code ?? 1);
    expect(output).toContain('Binary migration failed');
    expect(output).not.toContain('migration completed');
  });

  it('reports a missing installer shell', async () => {
    mocks.spawn.mockImplementationOnce(() => {
      throw new Error('spawn ENOENT');
    });
    expect(await runUpdateCommand([], deps)).toBe(1);
    expect(output).toContain('ENOENT');
  });

  it('keeps a current standalone binary without migration', async () => {
    mocks.standalone = true;
    mocks.check.mockResolvedValue({
      current: '1.2.3',
      latest: '1.2.3',
      outdated: false,
      checkFailed: false,
    });
    expect(await runUpdateCommand([], deps)).toBe(0);
    expect(output).toContain('already on the latest');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('updates a standalone binary in place and clears its staged update', async () => {
    mocks.standalone = true;
    expect(await runUpdateCommand([], deps)).toBe(0);
    expect(mocks.updateBinary).toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
