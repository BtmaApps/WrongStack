/**
 * close() must fail the calls still in flight. It detaches the socket before
 * ending it, so the socket's own 'close' event no longer counts as the current
 * connection closing and cannot reject them; they used to hang to their
 * per-call timeout (30 s, 60 s for append).
 */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

// Running from src there is no built project-server.js; report it present so
// the client connects to the fake owner below instead of refusing.
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  const existsSync = (p: fs.PathLike) =>
    String(p).endsWith(`${path.sep}project-server.js`) || real.existsSync(p);
  return { ...real, existsSync, default: { ...real, existsSync } };
});

const { ChronicleProjectServerClient } = await import(
  '../../src/chronicle/project-server-client.js'
);
const { chronicleProjectServerEndpoint } = await import(
  '../../src/chronicle/project-server-endpoint.js'
);
const { CHRONICLE_PROJECT_SERVER_PROTOCOL_VERSION } = await import(
  '../../src/chronicle/project-server-protocol.js'
);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A fake Chronicle owner that answers the hello and holds every request. */
async function holdingOwner() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-close-'));
  const projectDir = path.join(root, '.wrongstack');
  fs.mkdirSync(projectDir, { recursive: true });
  const endpoint = chronicleProjectServerEndpoint(projectDir);
  let held!: () => void;
  const requestHeld = new Promise<void>((resolve) => {
    held = resolve;
  });
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('data', () => held());
    socket.write(
      `${JSON.stringify({
        type: 'hello',
        protocolVersion: CHRONICLE_PROJECT_SERVER_PROTOCOL_VERSION,
        pid: process.pid,
        projectRoot: root,
        projectDir,
        chronicleDirectory: projectDir,
        endpoint,
        startedAt: new Date().toISOString(),
      })}\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(endpoint, resolve));
  cleanups.push(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const client = new ChronicleProjectServerClient({
    projectRoot: root,
    globalRoot: root,
    projectId: 'chronicle-close',
    projectDir,
    workspaceId: 'chronicle-close',
  });
  return { client, requestHeld };
}

it('rejects in-flight calls when the client is closed', async () => {
  const { client, requestHeld } = await holdingOwner();
  const call = client.call('ping', {}, { timeoutMs: 20_000 });
  let outcome = 'pending';
  call.then(
    () => {
      outcome = 'resolved';
    },
    (error: Error) => {
      outcome = error.message;
    },
  );
  await requestHeld;
  await client.close();
  await new Promise((resolve) => setImmediate(resolve));
  expect(outcome).toBe('Chronicle project server connection closed');
});
