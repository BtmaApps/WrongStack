import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((): boolean => true),
  readFileSync: vi.fn((): string => JSON.stringify({ authToken: 'owner-token' })),
  createConnection: vi.fn(),
  spawn: vi.fn(),
  openDaemonLogFd: vi.fn((): number | null => null),
  closeDaemonLogFd: vi.fn(),
}));

vi.mock('../src/daemon-log.js', () => ({
  closeDaemonLogFd: mocks.closeDaemonLogFd,
  openDaemonLogFd: mocks.openDaemonLogFd,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, existsSync: mocks.existsSync, readFileSync: mocks.readFileSync },
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  };
});
vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return {
    ...actual,
    default: { ...actual, createConnection: mocks.createConnection },
    createConnection: mocks.createConnection,
  };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: { ...actual, spawn: mocks.spawn },
    spawn: mocks.spawn,
  };
});

import { SageProjectServerConnection } from '../src/project-server-client.js';
import type { SageProjectServerConnectionState } from '../src/project-server-client-contract.js';
import { SAGE_PROJECT_SERVER_PROTOCOL_VERSION } from '../src/project-server-protocol.js';

/**
 * Regression (round r1-20261024): close() during an in-flight connect election
 * did not stop the election. The loop treated the teardown like any failed
 * attempt — it retried, re-armed `spawnDetachedServer()` (a detached daemon
 * process after the owner was disposed/released), and a post-close `hello`
 * frame flipped the disposed connection back to 'connected'.
 *
 * `close()` is the single teardown entry (`dispose()`, `releaseConnection()`,
 * `shutdown()`'s finally, `status()`'s catch), so every owner teardown path
 * funnels through the epoch guard added here: elections capture
 * `connectEpoch` and stop when it moves; a stale hello with no waiting
 * handshake can no longer resurrect the state.
 *
 * Interleavings are gated on observable events; fake timers drive every
 * production delay (75ms retry pause, 750ms spawn cadence, 750ms handshake
 * timeout, 10s election deadline).
 */
class FakeSocket extends EventEmitter {
  destroyed = false;
  readonly setEncoding = vi.fn();
  readonly write = vi.fn();
  readonly destroy = vi.fn((error?: Error) => {
    this.destroyed = true;
    if (error) this.emit('error', error);
  });
}

function hello(overrides: Record<string, unknown> = {}) {
  return {
    type: 'hello',
    protocolVersion: SAGE_PROJECT_SERVER_PROTOCOL_VERSION,
    pid: 4242,
    projectRoot: 'D:/repo',
    storageRoot: 'D:/repo/.wstack/sage',
    endpoint: 'pipe',
    startedAt: '2026-10-24T10:00:00.000Z',
    ...overrides,
  };
}

function send(socket: FakeSocket, message: unknown): void {
  socket.emit('data', `${JSON.stringify(message)}\n`);
}

let sockets: FakeSocket[];

function socketAt(index: number): FakeSocket {
  const socket = sockets[index];
  if (!socket) throw new Error(`expected socket #${index} to be connected`);
  return socket;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.openDaemonLogFd.mockReturnValue(null);
  mocks.existsSync.mockReturnValue(true);
  mocks.readFileSync.mockReturnValue(JSON.stringify({ authToken: 'owner-token' }));
  sockets = [];
  mocks.createConnection.mockImplementation(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = vi.fn();
    return child;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SageProjectServerConnection close() during the connect election', () => {
  it('stops a mid-election teardown: no reconnect, no respawn, no resurrection', async () => {
    const connection = new SageProjectServerConnection('D:/repo');
    const states: SageProjectServerConnectionState[] = [];
    connection.onStateChange((state) => states.push(state));

    const settled: { done: boolean; ok: boolean; reason?: unknown } = { done: false, ok: false };
    const connecting = connection.connect();
    connecting.then(
      () => {
        settled.done = true;
        settled.ok = true;
      },
      (reason) => {
        settled.done = true;
        settled.ok = false;
        settled.reason = reason;
      },
    );

    // Attempt #1 fails like a dead endpoint; the election re-arms the spawn
    // and parks in its 75ms retry pause.
    expect(sockets.length).toBe(1);
    socketAt(0).emit('error', Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);

    // Owner teardown lands mid-election.
    connection.close();
    expect(connection.getState().status).toBe('offline');

    // A daemon appearing after the teardown must find no election to complete.
    await vi.advanceTimersByTimeAsync(75);
    if (sockets.length > 1) {
      send(socketAt(1), hello());
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(12_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(sockets.length).toBe(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(states.map((state) => state.status)).not.toContain('connected');
    expect(connection.getState().status).toBe('offline');
    expect(settled.done).toBe(true);
    expect(settled.ok).toBe(false);
    expect((settled.reason as Error)?.message).toBe('SAGE server client disconnected');
  });

  it('close() while the first attempt is in flight rejects at once; no attempt #2', async () => {
    const connection = new SageProjectServerConnection('D:/repo');
    const settled: { done: boolean; ok: boolean; reason?: unknown } = { done: false, ok: false };
    const connecting = connection.connect();
    connecting.then(
      () => {
        settled.done = true;
        settled.ok = true;
      },
      (reason) => {
        settled.done = true;
        settled.ok = false;
        settled.reason = reason;
      },
    );

    expect(sockets.length).toBe(1);
    connection.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled.done).toBe(true);
    expect(settled.ok).toBe(false);
    expect((settled.reason as Error)?.message).toBe('SAGE server client disconnected');
    expect(connection.getState().status).toBe('offline');

    await vi.advanceTimersByTimeAsync(12_000);
    expect(sockets.length).toBe(1);
  });

  it('a NEW election after close() still connects (releaseConnection contract)', async () => {
    const connection = new SageProjectServerConnection('D:/repo');

    const first = connection.connect();
    send(socketAt(0), hello());
    await first;
    expect(connection.getState().connected).toBe(true);
    connection.close();
    expect(connection.getState().status).toBe('offline');

    const second = connection.connect();
    expect(sockets.length).toBe(2);
    send(socketAt(1), hello());
    await second;
    expect(connection.getState().connected).toBe(true);
    connection.close();
  });

  it('retries without a close() are untouched: attempt #2 still completes', async () => {
    const connection = new SageProjectServerConnection('D:/repo');
    const connecting = connection.connect();
    expect(sockets.length).toBe(1);
    socketAt(0).emit('error', Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' }));
    await vi.advanceTimersByTimeAsync(75);
    expect(sockets.length).toBe(2);
    send(socketAt(1), hello());
    await connecting;
    expect(connection.getState().connected).toBe(true);
    connection.close();
  });

  it('a hello for a handshake nobody waits on cannot resurrect the state', async () => {
    const connection = new SageProjectServerConnection('D:/repo');
    const states: SageProjectServerConnectionState[] = [];
    connection.onStateChange((state) => states.push(state));

    const connecting = connection.connect();
    // Close before the handshake answers: the attempt rejects, no election
    // remains, and the (already buffered) hello must be ignored.
    connection.close();
    connecting.catch(() => undefined);
    send(socketAt(0), hello());
    await vi.advanceTimersByTimeAsync(0);

    expect(states.map((state) => state.status)).not.toContain('connected');
    expect(connection.getState().status).toBe('offline');
  });
});
