import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadReleaseAsset } from '../src/release-asset-download.js';
import {
  parseSha256Sums,
  replaceExecutable,
  standaloneAssetName,
} from '../src/standalone-update.js';

describe('standaloneAssetName', () => {
  it('matches the names scripts/build-binaries.mjs publishes', async () => {
    const build = (await import('../../../scripts/build-binaries.mjs')) as {
      ALL_TARGETS: string[];
      outputName: (target: string) => string;
    };
    for (const target of build.ALL_TARGETS) {
      expect(standaloneAssetName(target)).toBe(build.outputName(target));
    }
    expect(standaloneAssetName('bun-windows-x64')).toBe('wstack-windows-x64.exe');
    expect(build.ALL_TARGETS).toContain('bun-windows-arm64');
    expect(standaloneAssetName('bun-windows-arm64')).toBe('wstack-windows-arm64.exe');
    expect(standaloneAssetName('bun-linux-arm64-musl')).toBe('wstack-linux-arm64-musl');
  });

  it('rejects empty build target lists and de-duplicates explicit targets', async () => {
    const { parseBinaryBuildArgs } = await import('../../../scripts/build-binaries.mjs');

    expect(() => parseBinaryBuildArgs(['--target='])).toThrow(
      '--target requires at least one build target',
    );
    expect(parseBinaryBuildArgs(['--target=bun-linux-x64,bun-linux-x64', '--skip-build'])).toEqual({
      targets: ['bun-linux-x64'],
      skipBuild: true,
    });
  });
});

describe('parseSha256Sums', () => {
  it('reads sha256sum output, including binary-mode `*` markers and CRLF', () => {
    const a = 'a'.repeat(64);
    const b = 'B'.repeat(64);
    const sums = parseSha256Sums(
      `${a}  wstack-linux-x64\r\n${b} *wstack-windows-x64.exe\n\nnoise\n`,
    );
    expect(sums.get('wstack-linux-x64')).toBe(a);
    expect(sums.get('wstack-windows-x64.exe')).toBe(b.toLowerCase());
    expect(sums.size).toBe(2);
  });

  it('rejects duplicate asset names instead of silently trusting the last digest', () => {
    const name = 'wstack-linux-x64';
    expect(() =>
      parseSha256Sums(`${'a'.repeat(64)}  ${name}\n${'b'.repeat(64)}  ${name}\n`),
    ).toThrow(`Duplicate SHA256SUMS entry: ${name}`);
  });

  it('keeps both standalone installers on the same single-entry checksum contract', () => {
    const shell = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../scripts/install/install.sh'),
      'utf8',
    );
    const powershell = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../scripts/install/install.ps1'),
      'utf8',
    );
    const rootShell = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../scripts/install.sh'),
      'utf8',
    );
    const rootPowershell = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../scripts/install.ps1'),
      'utf8',
    );

    expect(shell).toContain('if (count == 1) print hash; else exit 1');
    expect(shell).toContain('must contain exactly one entry for $asset');
    expect(powershell).toContain('$ExpectedMatches.Count -ne 1');
    expect(powershell).toContain('must contain exactly one entry for $Asset');
    expect(rootShell).toBe(shell);
    expect(rootPowershell).toBe(powershell);
  });
});

describe('downloadReleaseAsset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an oversized declared response before reading its body', async () => {
    const getReader = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-length': '5' }),
        body: { getReader },
      })),
    );

    await expect(downloadReleaseAsset('https://example.test/asset', 1000, 4)).rejects.toThrow(
      'is too large',
    );
    expect(getReader).not.toHaveBeenCalled();
  });

  it('cancels an oversized streamed body when content-length is absent', async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: Uint8Array.from([1, 2, 3]) })
      .mockResolvedValueOnce({ done: false, value: Uint8Array.from([4, 5]) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        body: { getReader: () => ({ read, cancel, releaseLock }) },
      })),
    );

    await expect(downloadReleaseAsset('https://example.test/asset', 1000, 4)).rejects.toThrow(
      'is too large',
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });
});

describe('replaceExecutable', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-replace-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('swaps the file in place on POSIX and leaves no staging file', () => {
    const target = path.join(dir, 'wstack');
    fs.writeFileSync(target, 'old');
    replaceExecutable(target, Buffer.from('new'), 'linux');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readdirSync(dir)).toEqual(['wstack']);
  });

  it('moves the old executable aside on Windows (a running .exe cannot be overwritten)', () => {
    const target = path.join(dir, 'wstack.exe');
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(`${target}.old`, 'older');
    replaceExecutable(target, Buffer.from('new'), 'win32');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readFileSync(`${target}.old`, 'utf8')).toBe('old');
    expect(fs.readdirSync(dir).sort()).toEqual(['wstack.exe', 'wstack.exe.old']);
  });

  // The staging path must be unguessable AND refuse an existing path, so a
  // writable install directory cannot redirect the write through a planted
  // symlink or hand the new executable pre-relaxed permissions.
  it('does not stage under the pid, so the path cannot be pre-created', () => {
    const target = path.join(dir, 'wstack');
    fs.writeFileSync(target, 'old');
    // Occupy the OLD, predictable name with a directory: a write there fails
    // with EISDIR, so this passes only if the staging name moved off the pid.
    fs.mkdirSync(`${target}.new-${process.pid}`);
    replaceExecutable(target, Buffer.from('new'), 'linux');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    // No staging leftovers beyond the planted directory.
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('wstack.new-'))).toEqual([
      `wstack.new-${process.pid}`,
    ]);
  });

  // A behavioural test cannot reach the exclusive-create branch: the staging
  // name is random precisely so no test (or attacker) can pre-create it. The
  // flag is therefore pinned at the source level, the same way the repo pins
  // other spawn/open options that have no observable failure path.
  it('opens the staging file exclusively', () => {
    const source = fs.readFileSync(new URL('../src/standalone-update.ts', import.meta.url), 'utf8');
    const write = /fs\.writeFileSync\(staged, bytes, \{([^}]*)\}\)/.exec(source);
    expect(
      write,
      'replaceExecutable no longer stages via writeFileSync(staged, bytes, {...})',
    ).not.toBeNull();
    expect(write?.[1]).toContain("flag: 'wx'");
    expect(write?.[1]).toContain('mode: 0o755');
  });
});
