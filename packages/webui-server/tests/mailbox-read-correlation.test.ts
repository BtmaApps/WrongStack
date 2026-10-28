import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleMailboxRoute, type MailboxRouteHandlers } from '../src/server/mailbox-routes.js';

describe('mailbox request ownership', () => {
  it.each([
    ['mailbox.messages', 'messages', 'mailbox.messages'],
    ['mailbox.agents', 'agents', 'mailbox.agents'],
    ['mailbox.clear', 'clear', 'mailbox.cleared'],
    ['mailbox.purge', 'purge', 'mailbox.purged'],
    ['mailbox.compact', 'compact', 'mailbox.compacted'],
  ] as const)(
    'correlates %s without claiming unrelated frames',
    async (type, method, replyType) => {
      const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: (value: string) => frames.push(JSON.parse(value)),
      } as unknown as WebSocket;
      await handleMailboxRoute(ws, { type, payload: { requestId: 'native-mailbox-read' } }, {
        [method]: (socket: WebSocket) => {
          socket.send(JSON.stringify({ type: replyType, payload: {} }));
          socket.send(JSON.stringify({ type: 'stats.result', payload: {} }));
        },
      } as unknown as MailboxRouteHandlers);
      expect(frames[0]?.payload.requestId).toBe('native-mailbox-read');
      expect(frames[1]?.payload.requestId).toBeUndefined();
    },
  );
});
