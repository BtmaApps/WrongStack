import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server-owned prompt queue, as the WebUI uses it: `queue` prompts go to
 * the server when it advertises `session.prompt-queue`, the server's list is
 * shown next to local items, and a drained prompt becomes the user's message.
 */

const client = vi.hoisted(() => ({
  isConnected: true,
  capabilities: new Set<string>(['session.prompt-queue']),
  sent: [] as Array<{ type: string; payload?: Record<string, unknown> }>,
}));

vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({
    get isConnected() {
      return client.isConnected;
    },
    supportsCapability: (c: string) => client.capabilities.has(c),
    send: (m: { type: string; payload?: Record<string, unknown> }) => {
      client.sent.push(m);
      return true;
    },
    consumeRequestedSwitch: () => true,
  }),
}));

import { usePromptQueueView } from '../../src/components/ChatInput/use-prompt-queue-view';
import { WS_HANDLERS } from '../../src/hooks/ws-handlers';
import { chatLane, useChatLanes } from '../../src/stores/chat-lanes';
import { useChatStore } from '../../src/stores/chat-store';
import { useSessionLanes } from '../../src/stores/session-lanes';
import { useSessionStore } from '../../src/stores/session-store';
import type { WSServerMessage } from '../../src/types';

const SESSION = 'sess_queue';

function fire(type: string, payload: Record<string, unknown>): void {
  WS_HANDLERS[type as WSServerMessage['type']]?.({
    type,
    payload: { sessionId: SESSION, ...payload },
  } as never);
}

const lane = () => chatLane(SESSION);
const sentOf = (type: string) => client.sent.filter((m) => m.type === type);

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as never;
  }
  client.isConnected = true;
  client.capabilities = new Set(['session.prompt-queue']);
  useChatLanes.setState({ lanes: {}, activeSessionId: '__unbound__' } as never);
  useSessionLanes.setState({ lanes: {}, activeSessionId: '__unbound__' } as never);
  useSessionStore.setState({ sessionId: SESSION } as never);
  fire('session.start', { model: 'm', provider: 'p', maxContext: 200_000, reset: true });
  client.sent.length = 0;
});

describe('queueing a prompt', () => {
  it('asks the server for the session queue when the session starts', () => {
    fire('session.start', { model: 'm', provider: 'p', maxContext: 200_000 });
    expect(sentOf('queue.get')).toEqual([{ type: 'queue.get', payload: { sessionId: SESSION } }]);
  });

  it('hands a queued prompt (with its images) to the server instead of keeping it', () => {
    const images = [
      { id: 'i1', dataUrl: 'data:image/png;base64,aGk=', mediaType: 'image/png', bytes: 2 },
    ];
    lane().enqueue('run the tests', 'queue', images);
    expect(lane().queue).toEqual([]);
    expect(sentOf('queue.add')).toEqual([
      {
        type: 'queue.add',
        payload: {
          sessionId: SESSION,
          text: 'run the tests',
          images: [{ data: 'aGk=', mediaType: 'image/png' }],
        },
      },
    ]);
  });

  it('keeps btw notes, and every prompt on a server without a queue, local', () => {
    lane().enqueue('by the way', 'btw');
    expect(sentOf('queue.add')).toEqual([]);

    client.capabilities = new Set();
    lane().enqueue('older server', 'queue');
    client.capabilities = new Set(['session.prompt-queue']);
    client.isConnected = false;
    lane().enqueue('offline', 'queue');

    expect(lane().queue.map((q) => q.text)).toEqual(['by the way', 'older server', 'offline']);
    expect(sentOf('queue.add')).toEqual([]);
  });
});

describe('server queue messages', () => {
  it('shows the server list and moves prompts queued here before the upgrade to the server', () => {
    client.capabilities = new Set();
    lane().enqueue('saved in this browser', 'queue');
    lane().enqueue('a btw note', 'btw');
    client.capabilities = new Set(['session.prompt-queue']);

    fire('queue.state', { items: [{ id: 'q1', text: 'on server', addedAt: 1, imageCount: 0 }] });

    expect(lane().serverQueue.map((q) => q.text)).toEqual(['on server']);
    expect(sentOf('queue.add').map((m) => m.payload?.['text'])).toEqual(['saved in this browser']);
    // Only the migrated `queue` item left the local queue.
    expect(lane().queue.map((q) => q.text)).toEqual(['a btw note']);
  });

  it('turns a drained prompt into the user message and marks the run as going', () => {
    fire('queue.drained', {
      item: {
        id: 'q1',
        text: 'next task',
        addedAt: 1,
        images: [{ data: 'aGk=', mediaType: 'image/png' }],
      },
    });
    const last = lane().messages.at(-1);
    expect(last).toMatchObject({ role: 'user', content: 'next task' });
    expect(last?.attachments?.[0]).toMatchObject({
      kind: 'image',
      dataUrl: 'data:image/png;base64,aGk=',
      mediaType: 'image/png',
    });
    expect(lane().isLoading).toBe(true);
  });
});

describe('usePromptQueueView', () => {
  it('lists local items then server items, and removes or clears each at its owner', () => {
    useChatStore.getState().setBoundSessionId(SESSION);
    lane().enqueue('local btw', 'btw');
    fire('queue.state', {
      items: [
        { id: 'q1', text: 'first', addedAt: 1, imageCount: 0 },
        { id: 'q2', text: 'second', addedAt: 2, imageCount: 2 },
      ],
    });
    const { result } = renderHook(() => usePromptQueueView());

    expect(result.current.queue.map((q) => q.text)).toEqual([
      'local btw',
      'first',
      'second (+2 images)',
    ]);

    act(() => result.current.remove(2));
    expect(sentOf('queue.remove')).toEqual([
      { type: 'queue.remove', payload: { sessionId: SESSION, id: 'q2' } },
    ]);
    act(() => result.current.remove(0));
    expect(lane().queue).toEqual([]);

    act(() => result.current.clear());
    expect(sentOf('queue.clear')).toEqual([
      { type: 'queue.clear', payload: { sessionId: SESSION } },
    ]);
  });
});
