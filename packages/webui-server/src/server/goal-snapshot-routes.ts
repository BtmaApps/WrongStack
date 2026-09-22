import type { WebSocket } from 'ws';
import type { WSClientMessage } from './types.js';

export interface GoalSnapshotRouteHandlers {
  getSnapshot: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
  mutate: (ws: WebSocket, msg: WSClientMessage) => Promise<void> | void;
}

export async function handleGoalSnapshotRoute(
  ws: WebSocket,
  msg: WSClientMessage,
  handlers: GoalSnapshotRouteHandlers,
): Promise<boolean> {
  switch (msg.type) {
    case 'goal.get':
    case 'goal-state.get':
      await handlers.getSnapshot(ws, msg);
      return true;
    case 'goal-state.set':
    case 'goal-state.refine':
    case 'goal-state.pause':
    case 'goal-state.resume':
    case 'goal-state.clear':
      await handlers.mutate(ws, msg);
      return true;
    default:
      return false;
  }
}
