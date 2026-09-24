/**
 * The server's 8 MiB outbound cap must apply to a single frame, not only to
 * bytes already queued in the socket.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sageProjectServerEndpoint,
  sageProjectServerMetadataPath,
} from '../src/project-server-endpoint.js';
import type { SageProjectServerMetadata } from '../src/project-server-protocol.js';
import { SqliteSageStore } from '../src/sqlite-store.js';
import type { Sage } from '../src/types.js';

const sageTestDir = path.dirname(fileURLToPath(import.meta.url));
const SRC_ENTRY = path.join(sageTestDir, '..', 'src', 'project-server.ts');
const SERVER_LAUNCH = { cmd: process.execPath, args: ['--import', 'tsx', SRC_ENTRY] };
const CAP = 8 * 1024 * 1024;

let projectRoot: string;
let child: ChildProcess | undefined;

function uniqueText(index: number): string {
  return Array.from({ length: 1_000 }, (_, token) => {
    const digest = createHash('sha256').update(`${index}:${token}`).digest('hex').slice(0, 12);
    return `${index.toString(36)}-${token.toString(36)}-${digest}`;
  }).join(' ');
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for SAGE daemon');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sage-write-frame-cap-'));
});

afterEach(async () => {
  child?.kill();
  child = undefined;
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe('SAGE daemon outbound frame cap', () => {
  it('does not transmit one response frame larger than the 8 MiB cap', async () => {
    const store = new SqliteSageStore({ projectRoot });
    const base = await store.rememberSage({ text: uniqueText(0), kind: 'fact' });
    const upsert = (store as unknown as { upsertMemory(memory: Sage): void }).upsertMemory.bind(
      store,
    );
    for (let i = 1; i < 500; i += 1) {
      upsert({ ...base, id: `frame-memory-${i}`, text: uniqueText(i) });
    }
    store.close();

    child = spawn(SERVER_LAUNCH.cmd, [...SERVER_LAUNCH.args, '--project-root', projectRoot], {
      stdio: 'ignore',
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
    const endpoint = sageProjectServerEndpoint(projectRoot);
    const socket = await waitFor(
      () =>
        new Promise<net.Socket | undefined>((resolve) => {
          const attempt = net.createConnection(endpoint);
          attempt.once('connect', () => resolve(attempt));
          attempt.once('error', () => resolve(undefined));
        }),
    );
    socket.setEncoding('utf8');
    let helloSeen = false;
    let responseStarted = false;
    let responseCompleted = false;
    let socketClosed = false;
    let receivedAfterStart = 0;
    socket.on('error', () => undefined);
    socket.on('close', () => {
      socketClosed = true;
    });
    socket.on('data', (chunk: string) => {
      if (!helloSeen) helloSeen = chunk.includes('"type":"hello"');
      if (responseStarted) {
        receivedAfterStart += Buffer.byteLength(chunk, 'utf8');
        if (chunk.includes('\n')) responseCompleted = true;
      }
    });
    await waitFor(async () => (helloSeen ? true : undefined));
    responseStarted = true;
    socket.write(
      `${JSON.stringify({
        type: 'request',
        id: 1,
        op: 'readAll',
        args: { scope: 'project' },
        meta: { clientId: 'frame-cap-client', authToken: metadata.authToken },
      })}\n`,
    );
    await waitFor(async () => (responseCompleted || socketClosed ? true : undefined), 60_000);

    expect(receivedAfterStart).toBeLessThanOrEqual(CAP);
    socket.destroy();
  }, 30_000);
});
