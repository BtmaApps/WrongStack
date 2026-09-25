/**
 * `wstack remote` handler: argument validation, the options handed to
 * `runRemoteSession`, and how the remote build is chosen (explicit file,
 * this standalone binary, an installed release, the cache, or a download).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  root: '',
  standalone: false,
  standaloneTarget: undefined as string | undefined,
  runRemoteSession: vi.fn(),
  systemSsh: vi.fn(),
  sha256File: vi.fn(),
  cachedFile: vi.fn(),
  findStandaloneRelease: vi.fn(),
  verifyStandaloneDigest: vi.fn(),
  download: vi.fn(),
  openBrowser: vi.fn(),
}));

vi.mock('@wrongstack/core/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/core/utils')>()),
  isStandaloneBinary: () => h.standalone,
  wstackGlobalRoot: () => h.root,
}));
vi.mock('../../src/remote/remote-session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/remote/remote-session.js')>()),
  runRemoteSession: h.runRemoteSession,
  systemSsh: h.systemSsh,
  sha256File: h.sha256File,
  cachedFile: h.cachedFile,
}));
vi.mock('../../src/standalone-update.js', () => ({
  MAX_BINARY_BYTES: 1234,
  findStandaloneRelease: h.findStandaloneRelease,
  verifyStandaloneDigest: h.verifyStandaloneDigest,
}));
vi.mock('../../src/release-asset-download.js', () => ({
  downloadReleaseAssetToFile: h.download,
}));
vi.mock('../../src/auth-menu/loopback-server.js', () => ({ openBrowser: h.openBrowser }));
vi.mock('../../src/version.js', () => ({
  CLI_VERSION: '9.9.9',
  get STANDALONE_TARGET() {
    return h.standaloneTarget;
  },
}));

import type { RemoteSessionOptions } from '../../src/remote/remote-session.js';
import { remoteCmd, runRemoteCommand } from '../../src/subcommands/handlers/remote.js';

const release = {
  version: '2.0.0',
  assetName: 'wstack-bun-linux-x64',
  asset: { browser_download_url: 'https://example.test/wstack' },
  sums: {},
};

function rig() {
  const lines: string[] = [];
  return { lines, renderer: { writeLine: (line: string) => lines.push(line) } };
}

/** Runs the command and returns the options `runRemoteSession` received. */
async function sessionOptions(flags: Record<string, string | boolean> = {}) {
  const r = rig();
  const code = await runRemoteCommand(['me@box:/srv/app'], flags, r.renderer);
  expect(code).toBe(0);
  return { opts: h.runRemoteSession.mock.calls[0]![0] as RemoteSessionOptions, lines: r.lines };
}

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-remote-cmd-'));
  h.standalone = false;
  h.standaloneTarget = undefined;
  h.runRemoteSession.mockReset().mockResolvedValue(0);
  h.systemSsh.mockReset().mockReturnValue({ run: vi.fn(), tunnel: vi.fn() });
  h.sha256File.mockReset().mockResolvedValue('ab'.repeat(32));
  h.cachedFile.mockReset().mockResolvedValue(undefined);
  h.findStandaloneRelease.mockReset().mockResolvedValue(release);
  h.verifyStandaloneDigest.mockReset().mockResolvedValue(undefined);
  h.download.mockReset();
});

afterEach(() => {
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('wstack remote: arguments', () => {
  it('prints usage and exits 0 for --help', async () => {
    const r = rig();
    expect(await runRemoteCommand([], { help: true }, r.renderer)).toBe(0);
    expect(r.lines[0]).toContain('Usage: wstack remote');
  });

  it('prints usage and exits 2 without a target', async () => {
    const r = rig();
    expect(await runRemoteCommand([], {}, r.renderer)).toBe(2);
    expect(r.lines[0]).toContain('Usage: wstack remote');
    expect(h.runRemoteSession).not.toHaveBeenCalled();
  });

  it('rejects a target without a project path', async () => {
    const r = rig();
    expect(await runRemoteCommand(['box'], {}, r.renderer)).toBe(2);
    expect(r.lines[0]).toContain('user@host:/path');
  });

  it.each(['0', '70000', 'abc', '1.5'])('rejects --port %s', async (port) => {
    const r = rig();
    expect(await runRemoteCommand(['me@box:/srv'], { port }, r.renderer)).toBe(2);
    expect(r.lines[0]).toBe(`--port must be a TCP port, got ${port}`);
  });
});

describe('wstack remote: session', () => {
  it('passes the parsed target and flags to the session', async () => {
    const { opts } = await sessionOptions({ port: '4000', keep: true, open: true });
    expect(opts).toMatchObject({
      target: { destination: 'me@box', path: '/srv/app' },
      localPort: 4000,
      keep: true,
      open: true,
    });
    expect(opts.openUrl).toBe(h.openBrowser);
    expect(opts.signal.aborted).toBe(false);
  });

  it('defaults to port 3456 and takes the target from --remote', async () => {
    const r = rig();
    await runRemoteCommand([], { remote: 'ssh://me@box:2222/srv' }, r.renderer);
    const opts = h.runRemoteSession.mock.calls[0]![0] as RemoteSessionOptions;
    expect(opts).toMatchObject({
      target: { destination: 'me@box', port: 2222, path: '/srv' },
      localPort: 3456,
      keep: false,
      open: false,
    });
  });

  it('hands --ssh-config to ssh', async () => {
    await sessionOptions({ 'ssh-config': '/etc/ssh.conf' });
    expect(h.systemSsh.mock.calls[0]![1]).toMatchObject({ sshConfig: '/etc/ssh.conf' });
  });

  it('aborts the session on SIGINT and drops its signal handlers afterwards', async () => {
    const before = process.listenerCount('SIGINT');
    let aborted = false;
    h.runRemoteSession.mockImplementation(async (opts: RemoteSessionOptions) => {
      expect(process.listenerCount('SIGINT')).toBe(before + 1);
      process.emit('SIGINT');
      aborted = opts.signal.aborted;
      return 0;
    });
    await sessionOptions();
    expect(aborted).toBe(true);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('reports a session failure and exits 1', async () => {
    h.runRemoteSession.mockRejectedValue(new Error('ssh: connection refused'));
    const r = rig();
    expect(await runRemoteCommand(['me@box:/srv'], {}, r.renderer)).toBe(1);
    expect(r.lines).toContain('ssh: connection refused');
  });

  it('is registered as a subcommand handler', async () => {
    const r = rig();
    const code = await remoteCmd(['me@box:/srv'], {
      flags: { keep: true },
      renderer: r.renderer,
    } as never);
    expect(code).toBe(0);
    expect(h.runRemoteSession.mock.calls[0]![0]).toMatchObject({ keep: true });
  });
});

describe('wstack remote: remote build', () => {
  it('uses an explicit --remote-binary, named by its digest', async () => {
    const { opts } = await sessionOptions({ 'remote-binary': 'build/wstack' });
    await expect(opts.resolveBinary('bun-linux-x64', [])).resolves.toEqual({
      file: path.resolve('build/wstack'),
      version: `build-${'ab'.repeat(8)}`,
    });
    expect(h.findStandaloneRelease).not.toHaveBeenCalled();
  });

  it('uploads this binary when it is the standalone build for the remote target', async () => {
    h.standalone = true;
    h.standaloneTarget = 'bun-linux-x64';
    const { opts } = await sessionOptions();
    await expect(opts.resolveBinary('bun-linux-x64', [])).resolves.toEqual({
      file: process.execPath,
      version: '9.9.9',
    });
  });

  it('skips the upload when the remote already has the release', async () => {
    h.standalone = true;
    h.standaloneTarget = 'bun-darwin-arm64';
    const { opts } = await sessionOptions();
    await expect(opts.resolveBinary('bun-linux-x64', ['2.0.0'])).resolves.toEqual({
      file: '',
      version: '2.0.0',
    });
    expect(h.findStandaloneRelease).toHaveBeenCalledWith('bun-linux-x64');
  });

  it('reuses a cached release build after checking its digest', async () => {
    h.cachedFile.mockImplementation(async (file: string) => file);
    const { opts } = await sessionOptions();
    const binary = await opts.resolveBinary('bun-linux-x64', []);
    expect(binary.file).toBe(path.join(h.root, 'remote-builds', `2.0.0-${release.assetName}`));
    expect(h.verifyStandaloneDigest).toHaveBeenCalledWith(release, 'ab'.repeat(32));
    expect(h.download).not.toHaveBeenCalled();
  });

  it('downloads and verifies a release build that is not cached', async () => {
    h.download.mockResolvedValue('cd'.repeat(32));
    const { opts, lines } = await sessionOptions();
    const binary = await opts.resolveBinary('bun-linux-x64', []);
    expect(binary).toEqual({
      file: path.join(h.root, 'remote-builds', `2.0.0-${release.assetName}`),
      version: '2.0.0',
    });
    expect(lines).toContain('Downloading WrongStack 2.0.0 for bun-linux-x64…');
    expect(h.download).toHaveBeenCalledWith(release.asset.browser_download_url, binary.file, {
      timeoutMs: 600_000,
      maxBytes: 1234,
    });
    expect(h.verifyStandaloneDigest).toHaveBeenCalledWith(release, 'cd'.repeat(32));
    expect(fs.existsSync(path.dirname(binary.file))).toBe(true);
  });

  it('deletes a download whose digest does not verify', async () => {
    h.download.mockImplementation(async (_url: string, file: string) => {
      fs.writeFileSync(file, 'tampered');
      return 'ef'.repeat(32);
    });
    h.verifyStandaloneDigest.mockRejectedValue(new Error('digest mismatch'));
    const { opts } = await sessionOptions();
    await expect(opts.resolveBinary('bun-linux-x64', [])).rejects.toThrow('digest mismatch');
    const file = path.join(h.root, 'remote-builds', `2.0.0-${release.assetName}`);
    expect(fs.existsSync(file)).toBe(false);
  });
});
