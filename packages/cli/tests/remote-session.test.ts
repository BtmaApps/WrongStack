/**
 * `wstack remote` session flow with a fake ssh: upload and its check, reusing
 * a running host, reopening a dropped tunnel, and stopping the remote host on
 * the way out unless `--keep`.
 */
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type RemoteSessionOptions,
  runRemoteSession,
  type SshResult,
} from '../src/remote/remote-session.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function buildFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-remote-bin-'));
  dirs.push(dir);
  const file = path.join(dir, 'wstack');
  fs.writeFileSync(file, content);
  return file;
}

async function drain(input: string | Readable): Promise<Buffer> {
  if (typeof input === 'string') return Buffer.from(input);
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** A fake remote host: which scripts ran, and the WebUI host it keeps. */
function fakeRemote(
  opts: {
    versions?: string[];
    running?: { port: number; version: string; token: string };
    corrupt?: boolean;
  } = {},
) {
  const ran: string[] = [];
  const state = { running: opts.running };
  const ssh = async (command: string, input: string | Readable): Promise<SshResult> => {
    const body = await drain(input);
    const script = command === 'sh -s' ? body.toString('utf8') : command;
    if (script.includes('uname -s')) {
      ran.push('probe');
      const lines = ['os=Linux', 'arch=x86_64', 'musl=0', 'path=1'];
      for (const v of opts.versions ?? []) lines.push(`version=${v}`);
      const running = state.running;
      if (running) {
        lines.push(`server={"pid":5,"port":${running.port},"version":"${running.version}"}`);
        lines.push(`token=${running.token}`);
      }
      return { code: 0, stdout: lines.join('\n') };
    }
    if (script.includes('cat > "$part"')) {
      ran.push('install');
      const sum = createHash('sha256')
        .update(opts.corrupt ? Buffer.from('other') : body)
        .digest('hex');
      return { code: 0, stdout: `sha256=${sum}\n` };
    }
    if (script.includes('--webui')) {
      ran.push('start');
      const token = /export WEBUI_TOKEN='([^']+)'/.exec(script)?.[1] ?? '';
      const version = /'wstack-([^']+)'/.exec(script)?.[1] ?? '';
      state.running = { port: 4100, version, token };
      return { code: 0, stdout: 'port=4100\npid=77\n' };
    }
    if (script.includes('stopped=1')) {
      ran.push('stop');
      state.running = undefined;
      return { code: 0, stdout: 'stopped=1\n' };
    }
    throw new Error(`unexpected script: ${script.slice(0, 80)}`);
  };
  return { ran, ssh, state };
}

/**
 * A tunnel that "forwards" by serving `/ws-auth` itself. `drop()` ends the
 * current one the way a lost connection does.
 */
function fakeTunnels() {
  const opened: Array<{ local: number; remote: number; drop: () => void }> = [];
  const tokens: string[] = [];
  const open = (localPort: number, remotePort: number): ChildProcess => {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      kill: () => boolean;
    };
    child.exitCode = null;
    const server = http.createServer((req, res) => {
      tokens.push(String(req.headers['x-ws-token']));
      res.statusCode = req.url === '/ws-auth' ? 200 : 404;
      res.end('{}');
    });
    server.listen(localPort, '127.0.0.1');
    const end = () => {
      if (child.exitCode !== null) return;
      server.close();
      server.closeAllConnections();
      child.exitCode = 255;
      child.emit('exit', 255);
    };
    child.kill = () => {
      end();
      return true;
    };
    opened.push({ local: localPort, remote: remotePort, drop: end });
    return child as unknown as ChildProcess;
  };
  return { opened, tokens, open };
}

function options(
  overrides: Partial<RemoteSessionOptions> &
    Pick<RemoteSessionOptions, 'ssh' | 'tunnel' | 'signal'>,
): RemoteSessionOptions & { lines: string[] } {
  const lines: string[] = [];
  return {
    target: { destination: 'dev@box', path: '/srv/app' },
    localPort: 3481,
    keep: false,
    open: false,
    log: (line) => lines.push(line),
    resolveBinary: async () => ({ file: buildFile('the build'), version: '1.2.3' }),
    sleep: async () => undefined,
    ...overrides,
    lines,
  };
}

async function until(check: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('runRemoteSession', () => {
  it('uploads, starts, reopens a dropped tunnel and stops the host on exit', async () => {
    const remote = fakeRemote();
    const tunnels = fakeTunnels();
    const controller = new AbortController();
    const opts = options({ ssh: remote.ssh, tunnel: tunnels.open, signal: controller.signal });
    const done = runRemoteSession(opts);

    await until(() => opts.lines.some((l) => l.includes('Press Ctrl+C')));
    expect(remote.ran).toEqual(['probe', 'install', 'start']);
    expect(remote.state.running?.version).toBe('1.2.3');
    expect(tunnels.opened[0]?.remote).toBe(4100);
    const url = opts.lines.find((l) => l.startsWith('WebUI for'));
    expect(url).toMatch(/^WebUI for dev@box:\/srv\/app → http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    expect(url).toContain(remote.state.running?.token);

    // The connection drops; the host keeps running and the same URL comes back.
    tunnels.opened[0]?.drop();
    await until(() => opts.lines.includes('Reconnected.'));
    expect(opts.lines).toContain('The connection to dev@box dropped; reconnecting in 1s…');
    expect(remote.ran).toEqual(['probe', 'install', 'start', 'probe']);
    expect(tunnels.opened[1]?.local).toBe(tunnels.opened[0]?.local);

    // The host died meanwhile: it is started again and the new URL announced.
    remote.state.running = undefined;
    tunnels.opened[1]?.drop();
    await until(() => opts.lines.filter((l) => l.startsWith('WebUI for')).length === 2);
    expect(opts.lines).toContain('The connection to dev@box dropped; reconnecting in 1s…');
    expect(remote.ran).toEqual(['probe', 'install', 'start', 'probe', 'probe', 'start']);

    controller.abort();
    await expect(done).resolves.toBe(0);
    expect(remote.ran.at(-1)).toBe('stop');
    expect(opts.lines.at(-1)).toBe('Stopped WrongStack on dev@box.');
  });

  it('reuses a host this version already runs and leaves it with --keep', async () => {
    const remote = fakeRemote({
      versions: ['1.2.3'],
      running: { port: 4200, version: '1.2.3', token: 'old-token' },
    });
    const tunnels = fakeTunnels();
    const controller = new AbortController();
    const opts = options({
      ssh: remote.ssh,
      tunnel: tunnels.open,
      signal: controller.signal,
      keep: true,
    });
    const done = runRemoteSession(opts);
    await until(() => opts.lines.some((l) => l.includes('Press Ctrl+C')));
    controller.abort();
    await done;

    expect(remote.ran).toEqual(['probe']);
    expect(tunnels.opened[0]?.remote).toBe(4200);
    expect(tunnels.tokens).toContain('old-token');
    expect(opts.lines.at(-1)).toBe('WrongStack keeps running on dev@box (--keep).');
  });

  it('replaces a host an older version left running', async () => {
    const remote = fakeRemote({ running: { port: 4200, version: '1.0.0', token: 'old-token' } });
    const tunnels = fakeTunnels();
    const controller = new AbortController();
    const opts = options({ ssh: remote.ssh, tunnel: tunnels.open, signal: controller.signal });
    const done = runRemoteSession(opts);
    await until(() => opts.lines.some((l) => l.includes('Press Ctrl+C')));
    controller.abort();
    await done;
    expect(remote.ran).toEqual(['probe', 'install', 'stop', 'start', 'stop']);
    expect(tunnels.opened[0]?.remote).toBe(4100);
  });

  it('refuses a build that arrived changed', async () => {
    const remote = fakeRemote({ corrupt: true });
    const tunnels = fakeTunnels();
    const opts = options({
      ssh: remote.ssh,
      tunnel: tunnels.open,
      signal: new AbortController().signal,
    });
    await expect(runRemoteSession(opts)).rejects.toThrow('does not match');
    expect(remote.ran).toEqual(['probe', 'install']);
    expect(tunnels.opened).toEqual([]);
  });

  it('reports a missing project directory before uploading anything', async () => {
    const ssh = async (): Promise<SshResult> => ({
      code: 0,
      stdout: 'os=Linux\narch=x86_64\npath=0',
    });
    const opts = options({
      ssh,
      tunnel: fakeTunnels().open,
      signal: new AbortController().signal,
    });
    await expect(runRemoteSession(opts)).rejects.toThrow('/srv/app does not exist on dev@box.');
  });

  it('fails clearly when the tunnel never forwards, and stops the host it started', async () => {
    const remote = fakeRemote();
    let killed = false;
    // Stays up but forwards nothing, as when sshd refuses port forwarding.
    const tunnel = (): ChildProcess => {
      const child = new EventEmitter() as EventEmitter & {
        exitCode: number | null;
        kill: () => boolean;
      };
      child.exitCode = null;
      child.kill = () => {
        killed = true;
        child.exitCode = 255;
        child.emit('exit', 255);
        return true;
      };
      return child as unknown as ChildProcess;
    };
    const opts = options({
      ssh: remote.ssh,
      tunnel,
      signal: new AbortController().signal,
      readyTimeoutMs: 300,
    });
    await expect(runRemoteSession(opts)).rejects.toThrow('AllowTcpForwarding');
    expect(killed).toBe(true);
    expect(remote.ran).toEqual(['probe', 'install', 'start', 'stop']);
  });
});
