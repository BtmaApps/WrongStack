import { ACPSessionError } from './acp-session-errors.js';

export interface PendingRequest {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timeoutMs: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export type State =
  | 'init'
  | 'ready'
  | 'authenticated'
  | 'sessioning'
  | 'prompting'
  | 'done'
  | 'closed';

/**
 * Fail and forget every in-flight request. Without a `reason` the session was
 * closed locally; with one, the agent connection ended (the process exited,
 * the socket closed), so no reply can arrive and waiting out each request's
 * timeout would only stall the caller.
 */
export function rejectPendingRequests(
  pending: Map<string | number, PendingRequest>,
  reason?: string,
): void {
  for (const p of pending.values()) {
    clearTimeout(p.timeoutHandle);
    const message =
      reason === undefined
        ? 'session was closed'
        : `agent connection closed (${reason}) during ${p.method}`;
    p.reject(new ACPSessionError('closed', message));
  }
  pending.clear();
}
