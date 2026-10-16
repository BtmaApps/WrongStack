import type * as net from 'node:net';

export interface ClientState {
  socket: net.Socket;
  buffer: string;
  /** Count of in-flight request handlers. Used to cap concurrent work per
   *  client. Note: handlers are NOT cancelled on disconnect — the mutation has
   *  already entered the storage layer and may have committed server-side. A
   *  lost response is accepted per the at-most-once-execution contract. */
  inflightRequests: number;
  lastSeenAt: number;
}

/**
 * One SIGTERM/SIGINT pair per PROCESS, not per module instance.
 *
 * The in-process test harness (packages/core/tests/helpers/project-server-
 * harness.ts) imports this module once per test case with a `?case=<n>` query
 * URL, so every case gets a fresh module instance whose start() would register
 * new signal handlers that the previous instance can never remove — the
 * closures are per-module, and eleven cases meant eleven live SIGTERM
 * handlers plus a MaxListenersExceededWarning in every coverage run. The
 * guard lives on globalThis under a Symbol.for key so every module instance
 * shares one pair: the first start() registers the handlers, every start()
 * re-targets them at its own stopAndExit, and detach() removes the pair.
 */
export interface KanbanSignalGuard {
  retarget(stopTerm: () => void, stopInt: () => void): void;
  detach(): void;
}

// ─── Frame I/O ───────────────────────────────────────────────────────────────

/**
 * Cap on outbound bytes queued for one client before it is dropped.
 *
 * `socket.write()` reporting `false` is the signal to stop producing; this
 * server broadcasts board events to every client, so ignoring it let a single
 * client that stopped reading grow the owner's heap by one queued broadcast at
 * a time, without limit. Board state lives in SQLite, so a dropped client
 * re-reads it on reconnect and loses only events it was already too far behind
 * to have handled.
 */
const MAX_CLIENT_WRITE_BUFFER_BYTES = 8 * 1024 * 1024;

export function writeFrame(socket: net.Socket, encoded: string): void {
  if (socket.destroyed) return;
  if (socket.writableLength > MAX_CLIENT_WRITE_BUFFER_BYTES) {
    socket.destroy(new Error('Kanban client fell too far behind on reads'));
    return;
  }
  socket.write(encoded);
}

export function sendFrame(socket: net.Socket, frame: unknown): void {
  writeFrame(socket, JSON.stringify(frame) + '\n');
}
