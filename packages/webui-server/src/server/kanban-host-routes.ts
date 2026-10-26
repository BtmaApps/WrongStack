import type { WebSocket } from 'ws';
import { correlatedReply } from './correlated-reply.js';
import type { WSClientMessage } from './types.js';

export interface KanbanHostRouteHandlers {
  meta: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  supervisorStatus: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  supervisorAudit: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  runStart: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
}

export async function handleKanbanHostRoute(
  ws: WebSocket,
  msg: WSClientMessage,
  handlers: KanbanHostRouteHandlers,
): Promise<boolean> {
  ws = correlatedReply(ws, msg.payload, [msg.type]).socket;
  switch (msg.type) {
    case 'kanban.meta':
      await handlers.meta(ws, msg);
      return true;
    case 'kanban.supervisor.status':
      await handlers.supervisorStatus(ws, msg);
      return true;
    case 'kanban.supervisor.audit':
      await handlers.supervisorAudit(ws, msg);
      return true;
    case 'kanban.run.start':
      await handlers.runStart(ws, msg);
      return true;
    default:
      return false;
  }
}
