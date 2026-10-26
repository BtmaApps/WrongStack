import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleSessionRoute, type SessionRouteHandlers } from '../src/server/session-routes';

describe('session context acknowledgement routing', () => {
  it('correlates context mutation results and failures for the asking desktop operation', async () => {
    const sent: Record<string, unknown>[] = [];
    const socket = {
      readyState: 1,
      send: (data: string) => sent.push(JSON.parse(data)),
    } as unknown as WebSocket;
    const handlers = {
      compactContext: async (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            type: 'key.operation_result',
            payload: { success: false, message: 'Compactor unavailable' },
          }),
        );
      },
      repairContext: async (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            type: 'key.operation_result',
            payload: { success: true, message: 'Repaired' },
          }),
        );
      },
    } as SessionRouteHandlers;
    await handleSessionRoute(
      socket,
      {
        type: 'context.compact',
        payload: { requestId: 'compact-a', sessionId: 'session-a' },
      } as never,
      handlers,
    );
    await handleSessionRoute(
      socket,
      {
        type: 'context.repair',
        payload: { requestId: 'repair-b', sessionId: 'session-b' },
      } as never,
      handlers,
    );
    expect(sent).toEqual([
      {
        type: 'key.operation_result',
        payload: { success: false, message: 'Compactor unavailable', requestId: 'compact-a' },
      },
      {
        type: 'key.operation_result',
        payload: { success: true, message: 'Repaired', requestId: 'repair-b' },
      },
    ]);
  });
  it('preserves the original socket and payload for legacy context requests', async () => {
    const socket = { readyState: 1 } as WebSocket;
    let actual: WebSocket | undefined;
    const handlers = {
      debugContext: async (ws: WebSocket) => {
        actual = ws;
      },
    } as SessionRouteHandlers;
    await handleSessionRoute(socket, { type: 'context.debug', payload: {} } as never, handlers);
    expect(actual).toBe(socket);
  });
});
