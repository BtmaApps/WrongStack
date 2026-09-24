/**
 * Authenticated event confidentiality: memory events must not be broadcast to
 * sockets that have not proved access to the owner-only server.json token.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  sageProjectServerEndpoint,
  sageProjectServerMetadataPath,
} from '../src/project-server-endpoint.js';
import type { SageProjectServerMetadata } from '../src/project-server-protocol.js';

const sageTestDir = dirname(fileURLToPath(import.meta.url));
const SRC_ENTRY = join(sageTestDir, '..', 'src', 'project-server.ts');
const SERVER_LAUNCH = { cmd: process.execPath, args: ['--import', 'tsx', SRC_ENTRY] };
let projectRoot: string;
let child: ChildProcess | undefined;

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for SAGE daemon');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

interface Frame {
  type: string;
  event?: string;
  id?: number;
}

async function connect(endpoint: string): Promise<{ socket: net.Socket; frames: Frame[] }> {
  const socket = await waitFor(
    () =>
      new Promise<net.Socket | undefined>((resolve) => {
        const attempt = net.createConnection(endpoint);
        attempt.once('connect', () => resolve(attempt));
        attempt.once('error', () => resolve(undefined));
      }),
  );
  socket.setEncoding('utf8');
  const frames: Frame[] = [];
  let buffer = '';
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) frames.push(JSON.parse(line) as Frame);
    }
  });
  await waitFor(async () => (frames.some((frame) => frame.type === 'hello') ? true : undefined));
  return { socket, frames };
}

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'sage-event-auth-'));
});

afterEach(async () => {
  child?.kill();
  child = undefined;
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe('SAGE daemon event authorization', () => {
  it('does not send memory events to a socket that never authenticated', async () => {
    child = spawn(SERVER_LAUNCH.cmd, [...SERVER_LAUNCH.args, '--project-root', projectRoot], {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, WRONGSTACK_SAGE_SERVER_IDLE_MS: '600000' },
    });
    const endpoint = sageProjectServerEndpoint(projectRoot);
    const metadata = await waitFor(async () => {
      try {
        return JSON.parse(
          await readFile(sageProjectServerMetadataPath(projectRoot), 'utf8'),
        ) as SageProjectServerMetadata;
      } catch {
        return undefined;
      }
    });

    const observer = await connect(endpoint);
    const authorized = await connect(endpoint);
    authorized.socket.write(
      `${JSON.stringify({
        type: 'request',
        id: 1,
        op: 'rememberSage',
        args: { input: { text: 'Authenticated event control.', kind: 'fact' } },
        meta: { clientId: 'authorized-client', authToken: metadata.authToken },
      })}\n`,
    );

    await waitFor(async () =>
      authorized.frames.some(
        (frame) => frame.type === 'event' && frame.event?.startsWith('memory.'),
      )
        ? true
        : undefined,
    );
    expect(
      authorized.frames.some(
        (frame) => frame.type === 'event' && frame.event?.startsWith('memory.'),
      ),
    ).toBe(true);
    expect(
      observer.frames.filter(
        (frame) => frame.type === 'event' && frame.event?.startsWith('memory.'),
      ),
    ).toEqual([]);

    observer.socket.destroy();
    authorized.socket.destroy();
  });
});
