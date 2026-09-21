/**
 * Shutdown delivers the stopping rejection even when the client's pipe is
 * congested.
 *
 * The idle-pipe delivery is pinned by project-server-stop-drain.test.ts and
 * passes because a small write on an idle Windows named pipe takes the
 * synchronous kernel path. But `stop()` used to follow its
 * `SageServerStoppingError` sweep with `destroy()` in the SAME tick: when the
 * server's write queue is congested (client paused, kernel pipe buffer full),
 * the stopping frame sits in the userland queue and destroy() discards the
 * whole queue — the in-flight caller got a bare close instead of its clean
 * rejection. This is the documented Windows named-pipe delivery loss
 * (write()+destroy() in the same tick loses the pending write), fixed by
 * closing with `end()` plus a bounded force-destroy, mirroring the
 * session-catalog/kanban/mailbox graceful-close pattern.
 *
 * Deterministic by construction: 2000 ping responses (~700KB) overflow any
 * kernel pipe buffer while the client is paused, the acceptCandidate
 * dispatch is parked on the candidate-accept file lock held from the test
 * process (same recipe as the stop-drain suite), and the shutdown frame is
 * queued after them all. The client resumes 150ms later — after the same-tick
 * destroy window, inside the end()-flush force window (500ms).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFileLock } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sageProjectServerEndpoint,
  sageProjectServerMetadataPath,
} from '../src/project-server-endpoint.js';
import type { SageProjectServerMetadata } from '../src/project-server-protocol.js';

interface ServerResponseFrame {
  type: 'response';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  errorName?: string | undefined;
}

const sageTestDir = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = join(sageTestDir, '..', 'dist', 'project-server.js');
const SRC_ENTRY = join(sageTestDir, '..', 'src', 'project-server.ts');

function resolveServerEntry(): { cmd: string; args: string[] } {
  try {
    accessSync(DIST_ENTRY);
    return { cmd: process.execPath, args: [DIST_ENTRY] };
  } catch {
    return { cmd: process.execPath, args: ['--import', 'tsx', SRC_ENTRY] };
  }
}

const SERVER_LAUNCH = resolveServerEntry();

interface Harness {
  metadata: SageProjectServerMetadata;
  responses: Map<number, ServerResponseFrame>;
  frames: Map<number, ServerResponseFrame[]>;
  socket: net.Socket;
  request(body: Record<string, unknown>): void;
  closed: Promise<void>;
}

let projectRoot: string;
let child: ChildProcess | undefined;

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for the SAGE daemon');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function startServer(): Promise<Harness> {
  child = spawn(SERVER_LAUNCH.cmd, [...SERVER_LAUNCH.args, '--project-root', projectRoot], {
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
    env: { ...process.env, WRONGSTACK_SAGE_SERVER_IDLE_MS: '600000' },
  });

  const metadata = await waitFor(async () => {
    try {
      return JSON.parse(
        await readFile(sageProjectServerMetadataPath(projectRoot), 'utf8'),
      ) as SageProjectServerMetadata;
    } catch {
      return undefined;
    }
  });

  const socket = await waitFor(
    () =>
      new Promise<net.Socket | undefined>((resolve) => {
        const attempt = net.createConnection(sageProjectServerEndpoint(projectRoot));
        attempt.once('connect', () => resolve(attempt));
        attempt.once('error', () => resolve(undefined));
      }),
  );
  socket.setEncoding('utf8');

  const responses = new Map<number, ServerResponseFrame>();
  const frames = new Map<number, ServerResponseFrame[]>();
  let buffer = '';
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
  });
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line) as ServerResponseFrame;
        if (message.type !== 'response') continue;
        if (!responses.has(message.id)) responses.set(message.id, message);
        const list = frames.get(message.id);
        if (list) list.push(message);
        else frames.set(message.id, [message]);
      } catch {
        // Not what this suite asserts on.
      }
    }
  });

  return {
    metadata,
    responses,
    frames,
    socket,
    request: (body: Record<string, unknown>) => socket.write(`${JSON.stringify(body)}\n`),
    closed,
  };
}

describe('SAGE daemon shutdown delivers under a congested pipe', () => {
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'sage-stop-delivery-'));
  });

  afterEach(async () => {
    child?.kill();
    child = undefined;
    await new Promise((r) => setTimeout(r, 150));
    await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  it('flushes the stopping rejection past a congested write queue', async () => {
    const h = await startServer();
    const meta = { clientId: 'stop-delivery-test', authToken: h.metadata.authToken };

    h.request({
      type: 'request',
      id: 1,
      op: 'createCandidate',
      args: { input: { text: 'stop-delivery regression candidate', kind: 'fact' } },
      meta,
    });
    const created = await waitFor(async () => {
      const r = h.responses.get(1);
      if (!r) return undefined;
      expect(r.ok).toBe(true);
      return r.result as { id: string };
    });

    // Park the accept dispatch mid-flight: the test process holds the same
    // candidate-accept lock the server's accept path waits on.
    let releaseHold: (() => void) | undefined;
    let holdEstablished: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      holdEstablished = resolve;
    });
    const held = withFileLock(
      join(projectRoot, '.wrongstack', 'memories', 'locks', `candidate-accept-${created.id}`),
      () => {
        holdEstablished?.();
        return new Promise<void>((resolve) => {
          releaseHold = resolve;
        });
      },
      { timeoutMs: 30_000, staleMs: 30 * 60_000 },
    ).catch(() => undefined);
    await lockHeld;

    // Congest the server's write path: the client stops reading, then ping
    // responses (~700KB) fill the kernel pipe buffer and back the rest up
    // into the server's userland write queue.
    h.socket.pause();
    const lines: string[] = [];
    for (let i = 2; i < 2002; i++) {
      lines.push(JSON.stringify({ type: 'request', id: i, op: 'ping', args: {}, meta }));
    }
    lines.push(
      JSON.stringify({
        type: 'request',
        id: 5001,
        op: 'acceptCandidate',
        args: { candidateId: created.id },
        meta,
      }),
    );
    lines.push(
      JSON.stringify({
        type: 'shutdown',
        id: 9001,
        reason: 'test',
        authToken: h.metadata.authToken,
      }),
    );
    h.socket.write(`${lines.join('\n')}\n`);

    // Resume AFTER the same-tick destroy window of the old close, but inside
    // the end()-flush force window (500ms) of the hardened one.
    await new Promise((r) => setTimeout(r, 150));
    h.socket.resume();
    await Promise.race([h.closed, new Promise((r) => setTimeout(r, 15_000))]);

    const inFlight = h.responses.get(5001);
    expect(inFlight).toBeDefined();
    expect(inFlight?.ok).toBe(false);
    expect(String(inFlight?.error)).toMatch(/stopping/i);
    expect(inFlight?.errorName).toBe('SageServerStoppingError');
    // Exactly one frame: the abort continuation writes after end() and must
    // stay silent (writeEncoded guards writableEnded).
    expect(h.frames.get(5001)).toHaveLength(1);
    // The shutdown ack rides in the same flushed queue.
    expect(h.responses.get(9001)?.ok).toBe(true);

    releaseHold?.();
    await held;
  }, 60_000);
});
