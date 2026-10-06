/**
 * Shared contract of the SAGE project-server client: timing/size constants,
 * connection state and call types, the attach-only "not running" error, and
 * the small cancellation-aware helpers the connection and its I/O module use.
 */
import type { SageRequestMetadata } from './project-server-protocol.js';

export const CONNECT_ATTEMPT_TIMEOUT_MS = 750;
export const SERVER_START_TIMEOUT_MS = 10_000;
export const DEFAULT_CALL_TIMEOUT_MS = 30_000;
export const MAX_FRAME_BUFFER_CHARS = 8 * 1024 * 1024;
/**
 * Pause between retries of a request refused with `UnauthorizedSageRequest`.
 * On cold spawn the daemon binds the socket before `store.initialize()` +
 * `writeMetadata()` finish, so the first request can arrive while
 * `server.json` does not exist yet. The token is invalidated in `onMessage`;
 * this delay gives the daemon time to write the file before
 * `currentAuthToken()` re-reads it.
 */
export const AUTH_RETRY_DELAY_MS = 150;
/**
 * How many auth-refused retries `call()` attempts before surfacing the error.
 * `onMessage` invalidates the cached token on every `UnauthorizedSageRequest`,
 * so each retry re-reads `server.json`. Bounded rather than a single shot
 * because a true cold spawn — SQLite open + migrations on a cold disk — can
 * take well over one delay interval before `writeMetadata()` lands; ~2s total
 * covers realistic init while still failing fast when the daemon is genuinely
 * unreachable.
 */
export const AUTH_RETRY_MAX_ATTEMPTS = 13;
/**
 * Minimum spacing between detached-server spawn attempts inside one
 * `connectWithElection` window. The first spawn still fires immediately;
 * re-arming is cadence-bounded so a dead first daemon is recovered without
 * flooding the machine with losing candidates (the endpoint bind IS the
 * election, so an extra spawn that cannot win exits without side effects).
 * Mirrors the mailbox client's fix for the same single-shot-spawn defect.
 */
export const SPAWN_RETRY_CADENCE_MS = 750;

export type SageProjectServerConnectionStatus =
  | 'unavailable'
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'stopping';

export interface SageProjectServerConnectionState {
  status: SageProjectServerConnectionStatus;
  connected: boolean;
  projectRoot: string;
  storageDirectory?: string | undefined;
  endpoint: string;
  pid?: number | undefined;
  lastError?: string | undefined;
}

export interface SageProjectServerCallOptions {
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  meta: SageRequestMetadata;
}

export interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal | undefined;
  onAbort?: (() => void) | undefined;
}

/**
 * Symmetric counterpart of the server's `MAX_CLIENT_WRITE_BUFFER_BYTES`
 * (project-server-wire.ts): the same 8 MB ceiling on bytes queued for outbound
 * write. A stalled daemon must not grow this process's heap without bound —
 * destroying the socket routes pending calls through the existing
 * transport-death rejection and the connect/election reconnect, and the
 * daemon re-reads its state from SQLite on the next connection (H4,
 * docs/archive/plans/sage-phase4-design.md).
 */
export const MAX_SERVER_WRITE_BUFFER_BYTES = 8 * 1024 * 1024;

/**
 * Thrown by an attach-only connection (`spawnIfMissing: false`) when no daemon
 * is serving the project. Named so a caller can tell "WrongStack is not open
 * here" apart from a daemon that is running but failing.
 */
export class SageProjectServerNotRunningError extends Error {
  override readonly name = 'SageProjectServerNotRunning';
  constructor(
    readonly projectRoot: string,
    cause?: unknown,
  ) {
    super(
      `No running WrongStack SAGE daemon for ${projectRoot}. Open wstack (CLI, TUI or WebUI) in this project, then retry.`,
      cause === undefined ? undefined : { cause },
    );
  }
}

export interface SageProjectServerConnectionOptions {
  /**
   * `false` = attach-only: connect to a daemon a WrongStack host already
   * started, never spawn one. For external clients (the SAGE MCP bridge) that
   * must not stand memory up on their own. Default `true`.
   */
  spawnIfMissing?: boolean | undefined;
}

/**
 * A sleep whose timer stays REF'd on purpose.
 *
 * Both callers (`connectWithElection`'s retry pause and the auth retry in
 * `request`) are awaited by boot code that has nothing else pending on the
 * loop: the previous socket is destroyed before the pause and the next one
 * does not exist yet. An unref'd timer there let Node decide the loop was
 * empty and exit 0 *in the middle of boot* — the WebUI process vanished
 * before printing its banner, and CI reported only "exited before it was
 * ready (code 0)". A pending promise must hold the process open; the hold is
 * bounded by the caller's own deadline (10s election, 3 auth retries).
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(cancellationError(signal!));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
}

export function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('SAGE request cancelled');
}

export function remoteError(message: string, name?: string): Error {
  const error = new Error(message);
  if (name && name !== 'Error') error.name = name;
  return error;
}
