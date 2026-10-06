/**
 * Wire layer of the SAGE project server: newline-delimited frame intake with
 * envelope validation, the per-frame auth-token gate, and bounded per-client
 * writes / broadcast. Stateless —
 * the daemon module owns the client set and passes it in.
 */
import { timingSafeTokenEqual } from '@wrongstack/primitives';
import type { ClientState } from './project-server-options.js';
import {
  encodeSageProjectServerMessage,
  SAGE_DISPATCH_FIELD_SPECS,
  type SageProjectServerClientMessage,
  type SageProjectServerMessage,
  type SageRequestMetadata,
} from './project-server-protocol.js';

const MAX_FRAME_BUFFER_CHARS = 8 * 1024 * 1024;

/**
 * Cap on outbound bytes queued for one client before it is dropped. This
 * server broadcasts `memory.*` events to every client, and `socket.write()`
 * buffers without limit when its `false` return is ignored — so one client
 * that stops reading would otherwise grow the owner's heap indefinitely.
 * Memory state is in SQLite; a dropped client re-reads it on reconnect.
 */
const MAX_CLIENT_WRITE_BUFFER_BYTES = 8 * 1024 * 1024;

export function writeEncoded(state: ClientState, encoded: string): void {
  // `writableEnded` matters as much as `destroyed` here: after stop() has
  // end()ed a socket, a dispatch completing during the drain would otherwise
  // write-after-end (its bytes are dropped silently at best). The caller
  // already holds the stopping rejection for that id.
  if (state.socket.destroyed || state.socket.writableEnded) return;
  if (
    Buffer.byteLength(encoded, 'utf8') > MAX_CLIENT_WRITE_BUFFER_BYTES ||
    state.socket.writableLength > MAX_CLIENT_WRITE_BUFFER_BYTES
  ) {
    state.socket.destroy(new Error('SAGE client fell too far behind on reads'));
    return;
  }
  state.socket.write(encoded);
}

export function send(state: ClientState, message: SageProjectServerMessage): void {
  writeEncoded(state, encodeSageProjectServerMessage(message));
}

/** Encode once, write to every client — see the mailbox owner for rationale. */
export function broadcast(
  clients: ReadonlySet<ClientState>,
  message: SageProjectServerMessage,
): void {
  if (clients.size === 0) return;
  const encoded = encodeSageProjectServerMessage(message);
  for (const state of clients) {
    if (!state.authenticated) continue;
    try {
      writeEncoded(state, encoded);
    } catch {
      state.socket.destroy();
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the untrusted JSON envelope before auth or dispatch touches it. */
export function parseClientMessage(value: unknown): SageProjectServerClientMessage | undefined {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 0) return undefined;
  switch (value.type) {
    case 'request':
      if (
        typeof value.op !== 'string' ||
        !Object.hasOwn(SAGE_DISPATCH_FIELD_SPECS, value.op) ||
        !isRecord(value.meta)
      )
        return undefined;
      return value as unknown as SageProjectServerClientMessage;
    case 'cancel':
    case 'shutdown':
      return value as unknown as SageProjectServerClientMessage;
    default:
      return undefined;
  }
}

/**
 * Append `chunk` to the client's frame buffer and hand every complete,
 * validated message to `handleMessage`. An oversized buffer, unparseable JSON
 * or an invalid envelope destroys the socket.
 */
export function consumeClientFrames(
  state: ClientState,
  chunk: string,
  handleMessage: (state: ClientState, message: SageProjectServerClientMessage) => void,
): void {
  state.spoken = true;
  state.buffer += chunk;
  if (state.buffer.length > MAX_FRAME_BUFFER_CHARS) {
    state.socket.destroy(new Error('SAGE request frame exceeded maximum size'));
    return;
  }
  while (true) {
    const newline = state.buffer.indexOf('\n');
    if (newline < 0) return;
    const line = state.buffer.slice(0, newline);
    state.buffer = state.buffer.slice(newline + 1);
    if (!line) continue;
    let rawMessage: unknown;
    try {
      rawMessage = JSON.parse(line) as unknown;
    } catch {
      state.socket.destroy(new Error('Invalid SAGE project server request'));
      return;
    }
    const message = parseClientMessage(rawMessage);
    if (!message) {
      state.socket.destroy(new Error('Invalid SAGE project server request'));
      return;
    }
    handleMessage(state, message);
  }
}

/**
 * Auth gate for one inbound frame: `request` and `shutdown` must carry the
 * daemon's per-process token. A mismatch answers with an
 * `UnauthorizedSageRequest` response, calls `onRejected` (the daemon
 * re-asserts its metadata) and returns false; a match marks the client
 * authenticated.
 */
export function authorizeClientMessage(
  state: ClientState,
  message: SageProjectServerClientMessage,
  authToken: string,
  onRejected: () => void,
): boolean {
  // WS-028: `shutdown` is now gated too. It stops the daemon for every client
  // in the project — a denial of service any same-UID process could trigger
  // with one unauthenticated frame. `cancel` stays ungated: it only reaches
  // the sending connection's own `state.active` map.
  const supplied =
    message.type === 'request'
      ? message.meta.authToken
      : message.type === 'shutdown'
        ? message.authToken
        : undefined;
  // Constant time: `!==` returns as soon as two characters differ, leaking how
  // long a guess's shared prefix was — the WS-110 class. Every sibling project
  // daemon was converted; SAGE was missed and still compared raw, with no rate
  // limit in front of it. `timingSafeTokenEqual` treats a missing `supplied`
  // as a mismatch, so the rejection below keeps its exact previous semantics.
  if (
    (message.type === 'request' || message.type === 'shutdown') &&
    !timingSafeTokenEqual(supplied, authToken)
  ) {
    onRejected();
    send(state, {
      type: 'response',
      id: message.id,
      ok: false,
      error:
        'SAGE IPC request rejected: missing or invalid authToken. ' +
        'Reconnect to refresh metadata (server.json#authToken).',
      errorName: 'UnauthorizedSageRequest',
    });
    return false;
  }
  if (message.type === 'request' || message.type === 'shutdown') {
    state.authenticated = true;
  }
  return true;
}

/**
 * Broadcast a `memory.*` store event to every authenticated client, carrying
 * only the correlators of the request that caused it.
 */
export function broadcastMemoryEvent(
  clients: ReadonlySet<ClientState>,
  event: string,
  payload: unknown,
  store: SageRequestMetadata | undefined,
): void {
  // Strip server-only secrets (authToken) before broadcasting to every
  // connected client. Without this, an event listener on one client
  // would receive another client's authToken via the broadcast meta,
  // turning the per-connection token into a shared secret.
  const safeMeta = store
    ? {
        clientId: store.clientId,
        ...(store.sessionId !== undefined ? { sessionId: store.sessionId } : {}),
        ...(store.traceId !== undefined ? { traceId: store.traceId } : {}),
      }
    : undefined;
  broadcast(clients, {
    type: 'event',
    event,
    payload,
    meta: safeMeta,
  });
}

/**
 * Answer request `id` on `state` once `work` settles — a result response on
 * success, an error response (message + name) on failure — and clear it from
 * the client's unsettled set either way. The returned promise never rejects.
 */
export function answerWhenSettled(
  state: ClientState,
  id: number,
  work: Promise<unknown>,
): Promise<void> {
  return work
    .then((result) => {
      state.unsettled.delete(id);
      send(state, { type: 'response', id, ok: true, result });
    })
    .catch((error) => {
      state.unsettled.delete(id);
      try {
        send(state, {
          type: 'response',
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
        });
      } catch {
        // socket already destroyed or write failed — nothing more to do
      }
    });
}
