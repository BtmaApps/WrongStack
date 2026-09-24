import { EventEmitter } from 'node:events';
import type * as net from 'node:net';
import { describe, expect, it } from 'vitest';
import { SageProjectServerConnection } from '../src/project-server-client.js';

/**
 * H4 regression (docs/sage-phase4-design.md): the client's outbound write
 * mirrors the server's writeEncoded cap — when bytes queued for the daemon
 * exceed 8 MB, the socket is destroyed instead of growing this process's
 * heap without bound. Destroy routes pending calls through the existing
 * transport-death rejection and the connect/election reconnect.
 */

/** The same ceiling as MAX_SERVER_WRITE_BUFFER_BYTES (private in the module). */
const CAP = 8 * 1024 * 1024;

interface FakeSocket extends EventEmitter {
  destroyed: boolean;
  writableLength: number;
  write: (chunk: string) => boolean;
  destroy: (error?: Error) => void;
}

function makeFakeSocket(writableLength: number): { socket: FakeSocket; written: string[] } {
  const written: string[] = [];
  const socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableLength,
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    destroy: (error?: Error) => {
      if (socket.destroyed) return;
      socket.destroyed = true;
      if (error) socket.emit('error', error);
      socket.emit('close');
    },
  }) as unknown as FakeSocket;
  return { socket, written };
}

function connectionWithSocket(socket: FakeSocket): SageProjectServerConnection {
  const conn = new SageProjectServerConnection('h4-write-cap-project');
  (conn as unknown as { socket: net.Socket | null }).socket = socket as unknown as net.Socket;
  return conn;
}

function writeThrough(conn: SageProjectServerConnection, message: object): void {
  (conn as unknown as { write(message: object): void }).write(message);
}

describe('SAGE client outbound write cap (H4)', () => {
  it('writes normally while queued bytes stay under the cap', () => {
    const { socket, written } = makeFakeSocket(1024);
    const conn = connectionWithSocket(socket);
    writeThrough(conn, { type: 'request', id: 1 });
    expect(socket.destroyed).toBe(false);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('"id":1');
  });

  it('destroys the socket instead of queueing past the cap', () => {
    const { socket, written } = makeFakeSocket(CAP + 1);
    const conn = connectionWithSocket(socket);
    const destroyErrors: Error[] = [];
    socket.on('error', (error: Error) => destroyErrors.push(error));
    writeThrough(conn, { type: 'request', id: 2 });
    expect(socket.destroyed).toBe(true);
    expect(written).toHaveLength(0);
    expect(destroyErrors).toHaveLength(1);
    expect(destroyErrors[0]?.message).toContain('fell too far behind on reads');
  });

  it('drops a single request frame larger than the cap before writing it', () => {
    const { socket, written } = makeFakeSocket(0);
    const conn = connectionWithSocket(socket);
    const requester = conn as unknown as {
      request(message: unknown, options: unknown): Promise<unknown>;
    };
    const pending = requester.request(
      {
        type: 'request',
        op: 'readAll',
        args: { scope: 'project', padding: 'x'.repeat(CAP + 1024) },
        meta: { clientId: 'frame-cap-client' },
      },
      { timeoutMs: 30_000, meta: { clientId: 'frame-cap-client' } },
    );
    void pending.catch(() => undefined);

    expect(written).toHaveLength(0);
    expect(socket.destroyed).toBe(true);
  });

  it('stays silent on an already-destroyed socket', () => {
    const { socket, written } = makeFakeSocket(0);
    socket.destroyed = true;
    const conn = connectionWithSocket(socket);
    writeThrough(conn, { type: 'request', id: 3 });
    expect(written).toHaveLength(0);
  });
});
