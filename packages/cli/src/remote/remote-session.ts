/**
 * `wstack remote user@host:/path`: the agent, its tools and its project
 * daemons run on the remote machine; the WebUI is opened locally through an
 * SSH tunnel. WrongStack's own build is uploaded to the remote on first use
 * (per version, next to nothing the user installed), the WebUI host is started
 * detached so a dropped connection does not end it, and the tunnel is reopened
 * when it drops.
 *
 * SSH is the system `ssh`, so the user's `~/.ssh/config`, agent and known
 * hosts apply. Credentials are not copied: the remote WrongStack uses its own
 * configuration, which the remote WebUI sets up like a local first run.
 *
 * @module remote/remote-session
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { buildChildEnv, toErrorMessage } from '@wrongstack/core/utils';
import {
  buildTargetFor,
  installScript,
  type ProbeResult,
  parseProbe,
  probeScript,
  type RemoteTarget,
  shQuote,
  startScript,
  stopScript,
} from './remote-target.js';

export interface SshResult {
  code: number;
  stdout: string;
}

/** Runs one command on the remote host; `input` is its stdin. */
export type SshRunner = (remoteCommand: string, input: string | Readable) => Promise<SshResult>;

/** Opens the tunnel; the returned process lives as long as the tunnel does. */
export type TunnelOpener = (localPort: number, remotePort: number) => ChildProcess;

export interface RemoteBinary {
  file: string;
  /** Names the build on the remote machine. */
  version: string;
}

export interface RemoteSessionOptions {
  target: RemoteTarget;
  /** Preferred local port for the WebUI (the next free one is used). */
  localPort: number;
  /** Leave the remote WebUI running after this command ends. */
  keep: boolean;
  open: boolean;
  signal: AbortSignal;
  log: (line: string) => void;
  ssh: SshRunner;
  tunnel: TunnelOpener;
  /** The build for a remote `buildTarget` (`bun-linux-x64`, …); may download it. */
  resolveBinary: (buildTarget: string, installed: readonly string[]) => Promise<RemoteBinary>;
  openUrl?: ((url: string) => void) | undefined;
  /** Waits before a reconnect attempt; injected in tests. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** How long the WebUI gets to answer through a new tunnel. */
  readyTimeoutMs?: number | undefined;
}

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const READY_TIMEOUT_MS = 30_000;

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** The first free port at or above `start` on the local loopback. */
export async function freeLocalPort(start: number): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free local port from ${start} to ${start + 199}.`);
}

const REMOTE_ERRORS: Record<string, string> = {
  path: 'cannot enter the project directory',
  exited: 'the WrongStack host exited',
  timeout: 'the WrongStack host did not report its port within two minutes',
};

function sshError(step: string, result: SshResult): Error {
  const lines = result.stdout.split(/\r?\n/);
  const code = lines.find((line) => line.startsWith('error='))?.slice('error='.length);
  const log = lines.filter((line) => line.startsWith('log=')).map((line) => line.slice(4));
  const reason = code ? (REMOTE_ERRORS[code] ?? code) : `ssh exited with ${result.code}`;
  const detail =
    log.length > 0 ? `:\n${log.join('\n')}` : code ? '.' : '. See the ssh message above.';
  return new Error(`Remote ${step} failed: ${reason}${detail}`);
}

/** Makes sure the build is on the remote machine; uploads and checks it if not. */
async function ensureBinary(opts: RemoteSessionOptions, probe: ProbeResult): Promise<RemoteBinary> {
  const buildTarget = buildTargetFor(probe.os, probe.arch, probe.musl);
  const binary = await opts.resolveBinary(buildTarget, probe.versions);
  if (probe.versions.includes(binary.version)) return binary;
  opts.log(
    `Uploading WrongStack ${binary.version} (${buildTarget}) to ${opts.target.destination}…`,
  );
  const sent = await sha256File(binary.file);
  const result = await opts.ssh(
    `sh -c ${shQuote(installScript(binary.version))}`,
    createReadStream(binary.file),
  );
  const received = /^sha256=([a-f0-9]{64})$/m.exec(result.stdout)?.[1];
  if (result.code !== 0 || !received) throw sshError('upload', result);
  if (received !== sent) {
    throw new Error('The build that arrived on the remote machine does not match the one sent.');
  }
  return binary;
}

interface RunningServer {
  port: number;
  token: string;
}

/** A server this version already runs for the path, or a new one. */
async function ensureServer(
  opts: RemoteSessionOptions,
  probe: ProbeResult,
  binary: RemoteBinary,
): Promise<RunningServer> {
  if (probe.server && probe.server.version === binary.version) {
    opts.log(`Reusing the WrongStack host already running on ${opts.target.destination}.`);
    return { port: probe.server.port, token: probe.server.token };
  }
  if (probe.server) await opts.ssh('sh -s', stopScript(opts.target.path));
  const token = randomBytes(24).toString('base64url');
  opts.log(`Starting WrongStack on ${opts.target.destination}:${opts.target.path}…`);
  const result = await opts.ssh(
    'sh -s',
    startScript({ path: opts.target.path, version: binary.version, token, preferredPort: 3456 }),
  );
  if (/^setup=1$/m.test(result.stdout)) {
    opts.log('No usable provider is set up there yet; choose one in the WebUI.');
  }
  const port = Number(/^port=(\d+)$/m.exec(result.stdout)?.[1]);
  if (result.code !== 0 || !Number.isInteger(port) || port <= 0) {
    throw sshError('start', result);
  }
  return { port, token };
}

async function probeRemote(opts: RemoteSessionOptions): Promise<ProbeResult> {
  const result = await opts.ssh('sh -s', probeScript(opts.target.path));
  if (result.code !== 0) throw sshError('connection', result);
  const probe = parseProbe(result.stdout);
  if (!probe.pathExists) {
    throw new Error(`${opts.target.path} does not exist on ${opts.target.destination}.`);
  }
  return probe;
}

/** Resolves once the WebUI answers through the tunnel, false if it never does. */
async function waitForWebui(
  localPort: number,
  token: string,
  tunnel: ChildProcess,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && tunnel.exitCode === null && !signal.aborted) {
    try {
      const res = await fetch(`http://127.0.0.1:${localPort}/ws-auth`, {
        headers: { 'X-WS-Token': token },
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return true;
    } catch {
      // Not forwarding yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function exited(child: ChildProcess): Promise<number> {
  return child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

export async function runRemoteSession(opts: RemoteSessionOptions): Promise<number> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let probe = await probeRemote(opts);
  const binary = await ensureBinary(opts, probe);
  let server = await ensureServer(opts, probe, binary);
  const localPort = await freeLocalPort(opts.localPort);
  let announced = '';
  let failures = 0;

  try {
    while (!opts.signal.aborted) {
      const tunnel = opts.tunnel(localPort, server.port);
      const stopTunnel = () => tunnel.kill();
      opts.signal.addEventListener('abort', stopTunnel, { once: true });
      const ready = await waitForWebui(
        localPort,
        server.token,
        tunnel,
        opts.signal,
        opts.readyTimeoutMs ?? READY_TIMEOUT_MS,
      );
      if (!ready && !opts.signal.aborted) {
        // A tunnel that stays up but never forwards (the server refused the
        // forwarding) would otherwise leave this waiting silently.
        tunnel.kill();
        if (!announced) {
          await exited(tunnel);
          opts.signal.removeEventListener('abort', stopTunnel);
          throw new Error(
            `The WebUI on ${opts.target.destination} did not answer through the SSH tunnel. ` +
              'Check that its sshd allows port forwarding (AllowTcpForwarding) and see ' +
              `${opts.target.path}/.wrongstack/remote-webui.log there.`,
          );
        }
      }
      if (ready) {
        failures = 0;
        const url = `http://127.0.0.1:${localPort}/?token=${server.token}`;
        if (url !== announced) {
          opts.log(`WebUI for ${opts.target.destination}:${opts.target.path} → ${url}`);
          opts.log('Press Ctrl+C to disconnect.');
          if (opts.open && !announced) opts.openUrl?.(url);
          announced = url;
        } else {
          opts.log('Reconnected.');
        }
      }
      await exited(tunnel);
      opts.signal.removeEventListener('abort', stopTunnel);
      if (opts.signal.aborted) break;

      const delay =
        RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
      failures += 1;
      opts.log(
        `The connection to ${opts.target.destination} dropped; reconnecting in ${delay / 1000}s…`,
      );
      await sleep(delay);
      if (opts.signal.aborted) break;
      try {
        probe = await probeRemote(opts);
        server = await ensureServer(opts, probe, binary);
      } catch (err) {
        opts.log(toErrorMessage(err));
      }
    }
  } finally {
    if (!opts.keep) {
      await opts
        .ssh('sh -s', stopScript(opts.target.path))
        .then(() => opts.log(`Stopped WrongStack on ${opts.target.destination}.`))
        .catch(() => opts.log('Could not stop the remote WrongStack host; it keeps running.'));
    } else {
      opts.log(`WrongStack keeps running on ${opts.target.destination} (--keep).`);
    }
  }
  return 0;
}

/**
 * What ssh needs beyond the child-process allowlist: the agent socket and the
 * passphrase helper. Everything else, provider keys included, stays behind (a
 * `SendEnv` rule would otherwise carry them to the remote machine).
 */
function sshAgentEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'SSH_AUTH_SOCK',
    'SSH_AGENT_PID',
    'SSH_ASKPASS',
    'SSH_ASKPASS_REQUIRE',
    'DISPLAY',
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** The system `ssh` for `target`, with the options every call shares. */
function sshCommandLine(
  target: RemoteTarget,
  options: { sshConfig?: string | undefined; batch: boolean },
): string[] {
  return [
    ...(options.sshConfig ? ['-F', options.sshConfig] : []),
    ...(target.port ? ['-p', String(target.port)] : []),
    // Without a terminal (or an askpass helper) a password prompt would hang.
    ...(options.batch ? ['-o', 'BatchMode=yes'] : []),
    '-o',
    'ConnectTimeout=20',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
  ];
}

export function systemSsh(
  target: RemoteTarget,
  options: { sshConfig?: string | undefined; batch: boolean },
): { run: SshRunner; tunnel: TunnelOpener } {
  const base = sshCommandLine(target, options);
  const run: SshRunner = (remoteCommand, input) =>
    new Promise((resolve) => {
      const child = spawn('ssh', [...base, target.destination, remoteCommand], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...buildChildEnv(), ...sshAgentEnv() },
        windowsHide: true,
      });
      let stdout = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        if (stdout.length < 1_000_000) stdout += chunk;
      });
      child.on('error', (err) => resolve({ code: 127, stdout: `error=${err.message}` }));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
      child.stdin?.on('error', () => undefined);
      if (typeof input === 'string') child.stdin?.end(input);
      else input.pipe(child.stdin!);
    });
  const tunnel: TunnelOpener = (localPort, remotePort) =>
    spawn(
      'ssh',
      [
        ...base,
        '-N',
        '-o',
        'ExitOnForwardFailure=yes',
        '-L',
        `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
        target.destination,
      ],
      {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...buildChildEnv(), ...sshAgentEnv() },
        windowsHide: true,
      },
    );
  return { run, tunnel };
}

/** Cached download location for release builds. */
export function releaseCacheFile(root: string, version: string, assetName: string): string {
  return path.join(root, 'remote-builds', `${version}-${assetName}`);
}

export async function cachedFile(file: string): Promise<string | undefined> {
  if (!existsSync(file)) return undefined;
  const stat = await fsp.stat(file);
  return stat.size > 0 ? file : undefined;
}
