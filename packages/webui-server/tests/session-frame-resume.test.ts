import { describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { readFrameCursors } from '../src/server/session-event-resume.js';
import { webuiSessionFrameLog } from '../src/server/session-frame-log.js';
import { createSessionHandlers } from '../src/server/session-handlers.js';

/**
 * Reconnect catch-up: a page that re-subscribes with frame cursors gets the
 * frames it missed instead of a transcript rebuilt from the journal, which
 * holds only committed messages and so dropped the answer still streaming.
 */

const writer = (id: string) => ({
  id,
  startedAt: '2026-01-01T00:00:00.000Z',
  append: async () => undefined,
  close: async () => undefined,
});

function harness() {
  // The resume writes serialized frames straight to the socket.
  const wire: Array<{ type: string; seq?: number; payload: Record<string, unknown> }> = [];
  const ws = {
    readyState: 1,
    bufferedAmount: 0,
    send: (data: string) => wire.push(JSON.parse(data)),
  } as unknown as WebSocket;
  const clients = new Map<WebSocket, { sessionId: string | null; sessionIds?: Set<string> }>();
  clients.set(ws, { sessionId: null });
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const loads: string[] = [];
  const handlers = createSessionHandlers({
    config: { model: 'm', provider: 'p' },
    context: { session: writer('boot') } as never,
    tokenCounter: { account: vi.fn(), total: () => ({}) } as never,
    clients: clients as never,
    getProjectRoot: () => '/repo',
    getSession: () => writer('boot') as never,
    setSession: vi.fn(),
    getSessionStore: () =>
      ({
        load: async (id: string) => {
          loads.push(id);
          return { messages: [{ role: 'user', content: `journal of ${id}` }], events: [] };
        },
      }) as never,
    sessionStartPayload: async (o) => ({ ...o }) as never,
    sendMessage: (_ws, message) => sent.push(message as never),
    broadcastMessage: (message) => sent.push(message as never),
  });
  const subscribe = (payload: Record<string, unknown>) =>
    handlers.subscribeSessions(ws, { type: 'session.subscribe', payload } as never);
  return { wire, sent, loads, subscribe };
}

const delta = (sessionId: string, text: string) => ({
  type: 'provider.text_delta',
  payload: { sessionId, text },
});

describe('session.subscribe with frame cursors', () => {
  it('sends a caught-up tab the frames it missed and no transcript', async () => {
    const log = webuiSessionFrameLog();
    for (const t of ['1', '2', '3', '4']) log.sequence('fr-live', delta('fr-live', t));
    const h = harness();

    await h.subscribe({
      sessionIds: ['fr-live'],
      cursors: { 'fr-live': 2 },
      eventEpoch: log.epoch,
    });

    expect(h.wire.map((m) => [m.type, m.seq ?? null, m.payload['text'] ?? null])).toEqual([
      ['provider.text_delta', 3, '3'],
      ['provider.text_delta', 4, '4'],
      ['session.frames_resumed', null, null],
    ]);
    expect(h.wire.at(-1)?.payload).toMatchObject({
      sessionId: 'fr-live',
      resumed: true,
      frames: 2,
    });
    expect(h.loads).toEqual([]);
    expect(h.sent.some((m) => m.type === 'session.start')).toBe(false);
  });

  it('does not replay a caught-up tab even if it also asked for a transcript', async () => {
    const log = webuiSessionFrameLog();
    log.sequence('fr-both', delta('fr-both', '1'));
    const h = harness();

    await h.subscribe({
      sessionIds: ['fr-both'],
      replayFor: ['fr-both'],
      cursors: { 'fr-both': 1 },
      eventEpoch: log.epoch,
    });

    // A replay rebuilt from the journal would overwrite the answer the
    // catch-up just completed.
    expect(h.wire.at(-1)?.payload).toMatchObject({ resumed: true, frames: 0 });
    expect(h.loads).toEqual([]);
  });

  it('falls back to the transcript when the gap cannot be covered', async () => {
    const log = webuiSessionFrameLog();
    log.sequence('fr-short', delta('fr-short', 'x'));
    const h = harness();

    // The page claims frame 9, which this server never issued.
    await h.subscribe({
      sessionIds: ['fr-short'],
      cursors: { 'fr-short': 9 },
      eventEpoch: log.epoch,
    });

    expect(h.wire).toHaveLength(1);
    expect(h.wire[0]?.payload).toMatchObject({ sessionId: 'fr-short', resumed: false });
    expect(h.loads).toEqual(['fr-short']);
    expect(h.sent.find((m) => m.type === 'session.start')?.payload).toMatchObject({
      sessionId: 'fr-short',
      replayReason: 'redisplay',
    });
  });

  it('never resumes a cursor from another server process', async () => {
    const log = webuiSessionFrameLog();
    log.sequence('fr-epoch', delta('fr-epoch', 'x'));
    const h = harness();

    await h.subscribe({
      sessionIds: ['fr-epoch'],
      cursors: { 'fr-epoch': 0 },
      eventEpoch: 'another-process',
    });

    expect(h.wire.map((m) => m.type)).toEqual(['session.frames_resumed']);
    expect(h.wire[0]?.payload).toMatchObject({ resumed: false });
    expect(h.loads).toEqual(['fr-epoch']);
  });

  it('answers each tab on its own: one caught up, one replayed, one untouched', async () => {
    const log = webuiSessionFrameLog();
    log.sequence('fr-a', delta('fr-a', 'a1'));
    log.sequence('fr-a', delta('fr-a', 'a2'));
    const h = harness();

    await h.subscribe({
      sessionIds: ['fr-a', 'fr-b', 'fr-c'],
      replayFor: ['fr-c'],
      cursors: { 'fr-a': 1, 'fr-b': 3 },
      eventEpoch: log.epoch,
    });

    const answers = h.wire
      .filter((m) => m.type === 'session.frames_resumed')
      .map((m) => [m.payload['sessionId'], m.payload['resumed']]);
    expect(answers).toEqual([
      ['fr-a', true],
      ['fr-b', false],
    ]);
    // fr-b could not be caught up; fr-c asked for its transcript as before.
    expect(h.loads.sort()).toEqual(['fr-b', 'fr-c']);
  });
});

describe('readFrameCursors', () => {
  it('keeps only well-formed cursors, and needs an epoch', () => {
    expect(readFrameCursors({ cursors: { a: 1 } })).toBeNull();
    expect(readFrameCursors({ eventEpoch: 'e', cursors: [1] })).toBeNull();
    const read = readFrameCursors({
      eventEpoch: 'e',
      cursors: { a: 3, b: -1, c: 1.5, d: '4', '': 2 },
    });
    expect(read?.epoch).toBe('e');
    expect([...(read?.cursors ?? [])]).toEqual([['a', 3]]);
  });
});
