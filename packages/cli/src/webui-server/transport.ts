/** Outbound frame delivery for the CLI-embedded WebUI host: unicast, session-aware broadcast, fan-out. */

import {
  clientWantsSession,
  sendSerialized,
  stampDispatchSession,
  webuiSessionFrameLog,
} from '@wrongstack/webui-server';
import type { WebSocket } from 'ws';
import type { ConnectedClient } from './connection-handler.js';
import type { WSServerMessage } from './contracts.js';

export interface WebuiTransport {
  send(ws: WebSocket, msg: WSServerMessage): void;
  broadcast(msg: WSServerMessage, targetSessionId?: string): void;
  broadcastEveryone(msg: WSServerMessage): void;
  sendResult(ws: WebSocket, success: boolean, message: string): void;
}

export function createWebuiTransport(clients: Map<WebSocket, ConnectedClient>): WebuiTransport {
  function send(ws: WebSocket, msg: WSServerMessage): void {
    // `stampDispatchSession` names the tab whose message is being handled on
    // `key.operation_result` frames, which carry no session of their own. This
    // host writes straight to `sendSerialized` rather than going through the
    // shared `send`, so it has to apply the stamp itself or the CLI-embedded
    // WebUI keeps mis-routing background tabs' result toasts. See B-05.
    sendSerialized(ws, JSON.stringify(stampDispatchSession(msg)));
  }

  /**
   * Broadcast, but session-aware: a frame whose payload names a session is
   * delivered only to connections displaying that session (their declared
   * `sessionIds` set from `session.subscribe`, or their single `sessionId`).
   * The old loop pushed every tagged frame to every socket — delivery relied
   * entirely on each client's goodwill to file it under the right tab, which
   * is no isolation boundary at all.
   *
   * `targetSessionId` overrides the payload's id: a subagent's codemap frame
   * names the SUBAGENT's session, which no tab subscribes to.
   */
  function broadcast(msg: WSServerMessage, targetSessionId?: string): void {
    const payload = (msg as { payload?: unknown }).payload;
    const sessionId =
      targetSessionId ??
      (payload &&
      typeof payload === 'object' &&
      typeof (payload as { sessionId?: unknown }).sessionId === 'string'
        ? (payload as { sessionId: string }).sessionId
        : undefined);
    // Session frames are numbered for reconnect catch-up (session-frame-log).
    const data = sessionId ? webuiSessionFrameLog().sequence(sessionId, msg) : JSON.stringify(msg);
    for (const [ws, client] of clients) {
      if (clientWantsSession(client, sessionId)) sendSerialized(ws, data);
    }
  }

  /** Every connection, unfiltered — see `ProjectHandlersContext.broadcastEveryone`. */
  function broadcastEveryone(msg: WSServerMessage): void {
    const data = JSON.stringify(msg);
    for (const [ws] of clients) sendSerialized(ws, data);
  }

  function sendResult(ws: WebSocket, success: boolean, message: string): void {
    send(ws, { type: 'key.operation_result', payload: { success, message } });
  }

  return { send, broadcast, broadcastEveryone, sendResult };
}
