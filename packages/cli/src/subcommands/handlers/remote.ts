/**
 * `wstack remote user@host:/path` (also `wstack --remote …`): run WrongStack on
 * a remote machine over SSH and use its WebUI locally. See
 * `remote/remote-session.ts` for what happens on the remote side.
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { isStandaloneBinary, toErrorMessage, wstackGlobalRoot } from '@wrongstack/core/utils';
import { openBrowser } from '../../auth-menu/loopback-server.js';
import { downloadReleaseAssetToFile } from '../../release-asset-download.js';
import {
  cachedFile,
  type RemoteBinary,
  releaseCacheFile,
  runRemoteSession,
  sha256File,
  systemSsh,
} from '../../remote/remote-session.js';
import { parseRemoteTarget } from '../../remote/remote-target.js';
import type { TerminalRenderer } from '../../renderer.js';
import {
  findStandaloneRelease,
  MAX_BINARY_BYTES,
  verifyStandaloneDigest,
} from '../../standalone-update.js';
import { CLI_VERSION, STANDALONE_TARGET } from '../../version.js';
import type { SubcommandHandler } from '../contracts.js';

const USAGE = `Usage: wstack remote <user@host:/path | ssh://user@host:port/path> [options]

Runs WrongStack on the remote machine, in that project directory, and opens its
WebUI here through an SSH tunnel. The agent, its tools and its daemons run
remotely. The system ssh is used, so ~/.ssh/config, your agent and known_hosts
apply. Nothing from your local configuration is copied; set up a provider in the
remote WebUI the first time.

Options:
  --port <n>            Local port for the WebUI (default 3456, next free one)
  --open                Open the WebUI in your browser
  --keep                Leave WrongStack running remotely when you disconnect
  --ssh-config <file>   Use this ssh config file (ssh -F)
  --remote-binary <f>   Upload this WrongStack build instead of the release one
`;

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' && value ? value : undefined;
}

/** The build for the remote machine: an explicit file, this binary, or a verified release. */
async function resolveBinary(
  buildTarget: string,
  installed: readonly string[],
  explicit: string | undefined,
  log: (line: string) => void,
): Promise<RemoteBinary> {
  if (explicit) {
    const file = path.resolve(explicit);
    const sha = await sha256File(file);
    return { file, version: `build-${sha.slice(0, 16)}` };
  }
  if (isStandaloneBinary() && STANDALONE_TARGET === buildTarget) {
    return { file: process.execPath, version: CLI_VERSION };
  }
  const release = await findStandaloneRelease(buildTarget);
  if (installed.includes(release.version)) return { file: '', version: release.version };
  const file = releaseCacheFile(wstackGlobalRoot(), release.version, release.assetName);
  const cached = await cachedFile(file);
  if (cached) {
    await verifyStandaloneDigest(release, await sha256File(cached));
    return { file: cached, version: release.version };
  }
  log(`Downloading WrongStack ${release.version} for ${buildTarget}…`);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.rm(file, { force: true });
  const sha = await downloadReleaseAssetToFile(release.asset.browser_download_url, file, {
    timeoutMs: 10 * 60_000,
    maxBytes: MAX_BINARY_BYTES,
  });
  try {
    await verifyStandaloneDigest(release, sha);
  } catch (err) {
    await fsp.rm(file, { force: true });
    throw err;
  }
  return { file, version: release.version };
}

export async function runRemoteCommand(
  args: string[],
  flags: Record<string, string | boolean>,
  renderer: Pick<TerminalRenderer, 'writeLine'>,
): Promise<number> {
  const write = (line: string) => renderer.writeLine(line);
  const targetText = flagString(flags, 'remote') ?? args[0];
  if (flags['help'] === true || !targetText) {
    write(USAGE);
    return flags['help'] === true ? 0 : 2;
  }
  let target: ReturnType<typeof parseRemoteTarget>;
  try {
    target = parseRemoteTarget(targetText);
  } catch (err) {
    write(toErrorMessage(err));
    return 2;
  }
  const portText = flagString(flags, 'port');
  const localPort = portText ? Number(portText) : 3456;
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65_535) {
    write(`--port must be a TCP port, got ${portText}`);
    return 2;
  }
  const sshConfig = flagString(flags, 'ssh-config');
  const explicitBinary = flagString(flags, 'remote-binary');
  const ssh = systemSsh(target, {
    ...(sshConfig ? { sshConfig } : {}),
    batch: !process.stdin.isTTY && !process.env['SSH_ASKPASS'],
  });

  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  try {
    return await runRemoteSession({
      target,
      localPort,
      keep: flags['keep'] === true,
      open: flags['open'] === true,
      signal: controller.signal,
      log: write,
      ssh: ssh.run,
      tunnel: ssh.tunnel,
      resolveBinary: (buildTarget, installed) =>
        resolveBinary(buildTarget, installed, explicitBinary, write),
      openUrl: openBrowser,
    });
  } catch (err) {
    write(toErrorMessage(err));
    return 1;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onInterrupt);
  }
}

/** Registry entry; `boot()` normally dispatches `remote` before loading any config. */
export const remoteCmd: SubcommandHandler = (args, deps) =>
  runRemoteCommand(args, deps.flags ?? {}, deps.renderer);
