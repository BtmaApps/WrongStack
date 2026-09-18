/**
 * Self-update for the standalone executable (scripts/build-binaries.mjs).
 *
 * The npm install updates through a package manager; the binary has none, so
 * it reads the latest GitHub release, downloads the asset built for its own
 * target, verifies it against the release's SHA256SUMS and swaps the running
 * executable in place.
 *
 * The swap never leaves the path empty: POSIX renames the new file over the
 * old one (a running process keeps its inode). Windows cannot overwrite a
 * running .exe but can rename it, so the old file moves aside to `.old` first
 * and is deleted by the next start (scripts/binary/entry.mjs).
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FetchError } from '@wrongstack/core/types';
import type { TerminalRenderer } from './renderer.js';
import { STANDALONE_TARGET } from './version.js';

export const RELEASES_REPO = 'WrongStack/WrongStack';
const API_LATEST = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
const MAX_BINARY_BYTES = 512 * 1024 * 1024;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LatestRelease {
  version: string;
  assets: ReleaseAsset[];
}

/** Asset name a build target publishes under (mirrors build-binaries.mjs `outputName`). */
export function standaloneAssetName(target: string): string {
  const name = `wstack-${target.replace(/^bun-/, '')}`;
  return target.startsWith('bun-windows') ? `${name}.exe` : name;
}

async function fetchLatestRelease(timeoutMs: number, signal?: AbortSignal): Promise<LatestRelease> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(API_LATEST, {
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wrongstack-cli' },
  });
  if (!res.ok) {
    throw new FetchError({
      message: `GitHub releases responded ${res.status}`,
      status: res.status,
      context: { op: 'checkForUpdate', registry: 'github-releases', url: API_LATEST },
    });
  }
  const data = (await res.json()) as { tag_name?: unknown; assets?: unknown };
  if (typeof data.tag_name !== 'string') throw new Error('Latest release has no tag');
  const assets = Array.isArray(data.assets)
    ? data.assets.filter(
        (a): a is ReleaseAsset =>
          typeof a?.name === 'string' && typeof a?.browser_download_url === 'string',
      )
    : [];
  return { version: data.tag_name.replace(/^v/, ''), assets };
}

/** Latest released version, for the update check. */
export async function fetchLatestStandaloneVersion(
  timeoutMs = 3000,
  signal?: AbortSignal,
): Promise<string> {
  return (await fetchLatestRelease(timeoutMs, signal)).version;
}

async function download(url: string, timeoutMs: number): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'wrongstack-cli' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`download ${url} responded ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_BINARY_BYTES) throw new Error(`download ${url} is too large`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BINARY_BYTES) throw new Error(`download ${url} is too large`);
  return body;
}

/** `<sha256>  <name>` lines → map. */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match?.[1] && match[2]) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

/**
 * Replace `target` with `bytes`. Staged next to the target so the final step
 * is a same-filesystem rename.
 */
export function replaceExecutable(
  target: string,
  bytes: Buffer,
  platform = process.platform,
): void {
  const staged = `${target}.new-${process.pid}`;
  fs.writeFileSync(staged, bytes, { mode: 0o755 });
  try {
    if (platform === 'win32') {
      const aside = `${target}.old`;
      fs.rmSync(aside, { force: true });
      fs.renameSync(target, aside);
      try {
        fs.renameSync(staged, target);
      } catch (error) {
        fs.renameSync(aside, target);
        throw error;
      }
    } else {
      fs.renameSync(staged, target);
    }
  } finally {
    fs.rmSync(staged, { force: true });
  }
}

/** `wstack update` for the standalone binary. Returns the process exit code. */
export async function updateStandaloneBinary(options: {
  current: string;
  renderer: Pick<TerminalRenderer, 'write'>;
}): Promise<number> {
  const { renderer } = options;
  if (!STANDALONE_TARGET) {
    renderer.write('Update failed: this executable does not record its build target.\n');
    return 1;
  }
  const assetName = standaloneAssetName(STANDALONE_TARGET);
  try {
    const release = await fetchLatestRelease(15_000);
    const asset = release.assets.find((a) => a.name === assetName);
    const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS');
    if (!asset || !sumsAsset) {
      renderer.write(`Update failed: release v${release.version} has no ${assetName} build.\n`);
      return 1;
    }
    renderer.write(`Updating wrongstack from v${options.current} to v${release.version}...\n`);
    renderer.write(`Downloading ${assetName}\n`);
    const [bytes, sumsText] = await Promise.all([
      download(asset.browser_download_url, 600_000),
      download(sumsAsset.browser_download_url, 30_000).then((b) => b.toString('utf8')),
    ]);
    const expected = parseSha256Sums(sumsText).get(assetName);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (!expected || expected !== actual) {
      renderer.write('Update failed: checksum does not match the release SHA256SUMS.\n');
      return 1;
    }
    const executable = fs.realpathSync(process.execPath);
    replaceExecutable(executable, bytes);
    renderer.write(
      `\nUpdated ${path.basename(executable)} to v${release.version}. Restart wrongstack to use it.\n`,
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const permission = /EACCES|EPERM/.test(msg)
      ? '\nThe executable is not writable by this user; rerun with the permissions it was installed with.'
      : '';
    renderer.write(`\nUpdate failed: ${msg}${permission}\n`);
    return 1;
  }
}
