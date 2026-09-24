import type { WebSocket } from 'ws';
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
