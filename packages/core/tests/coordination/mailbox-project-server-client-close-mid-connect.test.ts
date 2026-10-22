import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MailboxProjectServerConnection } from '../../src/coordination/mailbox-project-server-client.js';
import { mailboxProjectServerEndpoint } from '../../src/coordination/mailbox-project-server-endpoint.js';

/**
 * Regression: close() during an in-flight connect did not end the election.
 * The socket's own 'close' no longer matched `this.socket`, so the handshake
 * failed only at its timer, and connectWithElection — unaware of the close —
 * re-armed the daemon spawn and connected again: a client its owner had closed
 * came back to life. The endpoint here accepts and never sends `hello`; the
 * daemon spawn is stubbed. After close(), "connect() settled" races "a second
 * connection reached the endpoint" — both are events, no sleeps.
 */
let projectDir: string;
let server: net.Server;
let connections: number;
let sockets: net.Socket[];
let waiters: Array<() => void>;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mailbox-close-mid-connect-'));
  connections = 0;
  sockets = [];
  waiters = [];
  server = net.createServer((socket) => {
    connections++;
    sockets.push(socket);
    socket.on('error', () => undefined);
    waiters.shift()?.();
  });
  await new Promise<void>((resolve) =>
    server.listen(mailboxProjectServerEndpoint(projectDir), resolve),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(projectDir, { recursive: true, force: true });
});

const nextConnection = () =>
  new Promise<'reconnected'>((resolve) => waiters.push(() => resolve('reconnected')));

it('close() mid-connect rejects the connect and never reconnects or spawns', async () => {
  const spawn = vi
    .spyOn(
      MailboxProjectServerConnection.prototype as unknown as {
        spawnDetachedServer(): number | undefined;
      },
      'spawnDetachedServer',
    )
    .mockReturnValue(undefined);
  const client = new MailboxProjectServerConnection(projectDir);
  const first = nextConnection();
  const pending = client.connect().then(
    () => 'resolved',
    (error: Error) => error.message,
  );
  await first;
  const second = nextConnection();
  client.close();
  expect(await Promise.race([pending, second])).toBe('Mailbox project server connection closed');
  expect(connections).toBe(1);
  expect(spawn).not.toHaveBeenCalled();
});
