import { describe, expect, it } from 'vitest';
import { createSessionCheckpointHandlers } from '../src/server/session-checkpoint-handlers.js';

/**
 * A payload-less client frame is legal at this boundary: the protocol decoder
 * requires `payload` only for SERVER-direction frames. These handlers are
 * request→response routes, so a payload-less frame must still produce an answer
 * frame — a `TypeError` instead escapes to connection-lifecycle's catch, which
 * only logs (`webui_server.message_handler_failed`) and leaves the client waiting
 * on a reply that never comes.
 *
 * Regression cover for the two handlers that used to destructure `msg.payload`
 * directly, OUTSIDE their own try block.
 */

interface Frame {
  type: string;
  payload: Record<string, unknown>;
}

function handlers(store?: unknown) {
  const sent: Frame[] = [];
  const h = createSessionCheckpointHandlers({
    ctx: {
      getSessionStore: () => store,
      getSession: () => ({ id: 'sess-1' }),
      isRunActive: () => false,
      getProjectRoot: () => '/proj',
    },
    sendTo: (_ws: unknown, f: Frame) => {
      sent.push(f);
    },
    broadcastToAll: () => {},
    result: (_ws: unknown, ok: boolean, error?: string) => {
      sent.push({ type: 'result', payload: { ok, error } });
    },
    actingSessionId: () => 'sess-1',
    ensureCurrentSession: () => true,
    contextForMessage: () => null,
    sessionsDirectory: () => '/tmp/sessions',
  } as never);
  const ws = {} as never;
  return { h, sent, ws };
}

describe('session checkpoint handlers — payload-less client frames', () => {
  it('inspectSession answers instead of throwing when the frame has no payload', async () => {
    const { h, sent, ws } = handlers();
    await expect(h.inspectSession(ws, { type: 'session.inspect' })).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload?.error).toBe('Session id is required');
  });

  it('rewindSession answers instead of throwing when the frame has no payload', async () => {
    const { h, sent, ws } = handlers();
    await expect(h.rewindSession(ws, { type: 'session.rewind' })).resolves.toBeUndefined();
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });

  it('rewindSession refuses a payload that carries no checkpointIndex', async () => {
    const { h, sent, ws } = handlers();
    await h.rewindSession(ws, { type: 'session.rewind', payload: { sessionId: 'sess-1' } });
    expect(sent[0]?.payload?.error).toBe('checkpointIndex is required');
  });

  it('inspectSession still validates a present-but-falsy id (control)', async () => {
    const { h, sent, ws } = handlers();
    await h.inspectSession(ws, { type: 'session.inspect', payload: { id: '' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload?.error).toBe('Session id is required');
  });

  it('inspectSession still loads a session on the happy path (control)', async () => {
    const store = {
      load: async () => ({
        metadata: { id: 'sess-1', title: 'T', model: 'm', provider: 'p' },
        events: [{ role: 'user', content: 'hi' }],
      }),
      list: async () => [{ id: 'sess-1', title: 'T' }],
    };
    const { h, sent, ws } = handlers(store);
    await h.inspectSession(ws, { type: 'session.inspect', payload: { id: 'sess-1' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe('session.inspect');
    expect(sent[0]?.payload?.id).toBe('sess-1');
  });
});
