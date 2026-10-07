import { toErrorMessage } from '@wrongstack/core/utils/error';
import { type FrameResume, negotiateProtocol } from '@wrongstack/webui-protocol';
import type { WSServerMessage } from '../types';
import type { EventHandler, PendingConfirm } from './ws-client-utils';

/**
 * Inbound-frame routing for the WebUI WebSocket client: confirm-prompt
 * bookkeeping, `session.start` protocol negotiation and swap matching, then
 * fan-out to the registered handlers. The client keeps the state; these
 * functions receive it through {@link WsClientInboundHost}.
 */
export interface WsClientInboundHost {
  readonly frameResume: FrameResume<WSServerMessage>;
  pendingConfirms: Map<string, PendingConfirm>;
  sessionId: string | null;
  protocolVersion: number | null;
  protocolCapabilities: Set<string>;
  requestedSwitchSessionId: string | null;
  pendingSwapTarget: string | null;
  sweepExpiredPendingConfirms(now: number): void;
  emit(msg: WSServerMessage): void;
  matchesPendingSwap(payload: { sessionId: string; reset?: boolean }): boolean;
  rememberSeenSession(sessionId: string): void;
  consumeArmedResend(sessionId: string): void;
}

export function routeInboundMessage(
  host: WsClientInboundHost,
  msg: WSServerMessage,
  pendingConfirmTtlMs: number,
): void {
  if (msg.type === 'session.frames_resumed') {
    host.frameResume.onFramesResumed(msg);
    return;
  }
  if (msg.type === 'session.start') msg = host.frameResume.onSessionStart(msg);
  if (msg.type === 'tool.confirm_needed') {
    const payload = msg.payload as never as {
      id: string;
      toolName: string;
      input: unknown;
      suggestedPattern: string;
    };

    // Sweep expired entries before adding the new one so the map never
    // grows past the active-prompt surface. Done inline (rather than on
    // a timer) because the per-insert cost is bounded by the number of
    // prompts the user could plausibly have open at once, and that's
    // also the natural upper bound for the map itself.
    host.sweepExpiredPendingConfirms(Date.now());
    host.pendingConfirms.set(payload.id, {
      expiresAtMs: Date.now() + pendingConfirmTtlMs,
    });
    host.emit(msg);
    return;
  }

  if (msg.type === 'tool.confirm_resolved') {
    const payload = msg.payload as { id?: unknown };
    if (typeof payload.id === 'string') host.pendingConfirms.delete(payload.id);
    host.emit(msg);
    return;
  }

  if (msg.type === 'session.start') {
    // C-2 fix: the `wsToken` field has been removed from the
    // `session.start` payload. The token is delivered via the
    // HttpOnly cookie set by `/ws-auth` (preferred) or via the
    // `?token=…` query param on the WS URL. There is no
    // client-side persistence of the token (no sessionStorage,
    // no localStorage) — every reconnect re-derives it from
    // the URL or relies on the cookie. See ws-auth.ts.
    const payload = msg.payload as {
      sessionId: string;
      reset?: boolean;
      protocolVersion?: number;
      protocolCapabilities?: string[];
    };
    const negotiation = negotiateProtocol(payload);
    host.sessionId = payload.sessionId;
    host.protocolVersion = negotiation.version;
    host.protocolCapabilities = new Set(negotiation.capabilities);
    // Did THIS client ask for THIS session? `session.start` also arrives
    // unrequested (boot, model switch, a server-side re-announce, another
    // tab's answer landing late), and an unrequested one must update its own
    // lane WITHOUT yanking the user out of the tab they are working in.
    //
    // Matching is by session id, never "a swap was outstanding": an answer
    // for some other session must leave the outstanding grant alone so the
    // tab the user actually clicked can still claim it.
    host.requestedSwitchSessionId = host.matchesPendingSwap(payload) ? payload.sessionId : null;
    if (host.requestedSwitchSessionId) host.pendingSwapTarget = null;
    host.rememberSeenSession(payload.sessionId);
    host.emit(msg);
    // Handlers have now bound and replayed this session's lane — the right
    // moment to replay a message the server refused with `session_not_ready`
    // while the session was not open in the runtime. One-shot: see
    // `armNotReadyResend` / `consumeArmedResend`.
    host.consumeArmedResend(payload.sessionId);
    return;
  } else if (
    msg.type === 'error' &&
    (msg.payload.phase === 'session.new' || msg.payload.phase === 'session.resume')
  ) {
    host.pendingSwapTarget = null;
  }

  host.emit(msg);
}

export function emitToHandlers(
  registry: Map<string, Set<EventHandler>>,
  msg: WSServerMessage,
): void {
  const handlers = registry.get(msg.type);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'ws_client.handler_error',
            messageType: msg.type,
            message: toErrorMessage(err),
            timestamp: new Date().toISOString(),
          }),
        );
      }
    }
  }
}
