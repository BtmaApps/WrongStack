import type { WebSocket } from 'ws';
import { correlatedReply } from './correlated-reply.js';
import type { WSClientMessage } from './types.js';

export interface ProcessRouteHandlers {
  list: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  output: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  kill: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  killAll: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
}

export async function handleProcessRoute(
  ws: WebSocket,
  msg: WSClientMessage,
  handlers: ProcessRouteHandlers,
): Promise<boolean> {
  if (msg.type.startsWith('process.'))
    ws = correlatedReply(ws, msg.payload, [
      'process.list',
      'process.output',
      'key.operation_result',
    ]).socket;
  switch (msg.type) {
    case 'process.list':
      await handlers.list(ws, msg);
      return true;
    case 'process.output':
      await handlers.output(ws, msg);
      return true;
    case 'process.kill':
      await handlers.kill(ws, msg);
      return true;
    case 'process.killAll':
      await handlers.killAll(ws, msg);
      return true;
    default:
      return false;
  }
}
