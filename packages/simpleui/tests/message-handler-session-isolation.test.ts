import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler } from '../src/lib/message-handler.js';
import { DEFAULT_PREFS } from '../src/lib/prefs-model.js';
import type { QueuedItem } from '../src/lib/queue-model.js';
import { createWorklistStore } from '../src/lib/worklist-store.js';
import type { ChatMessage, ToolCallInfo } from '../src/types.js';

function harness() {
  let messages: ChatMessage[] = [];
  let running = false;
  let activity = '';
  let toolCalls: ToolCallInfo[] = [];
  let queue: QueuedItem[] = [];
  const queueRef = { current: queue };
  const dispatchUserMessage = vi.fn(() => true);
  const noop = () => undefined;
  const base: Record<string, unknown> = {
    prefsRef: { current: { ...DEFAULT_PREFS, chime: false } },
    queueRef,
    sessionIdRef: { current: 'session-a' },
    setMessages: (value: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
      messages = typeof value === 'function' ? value(messages) : value;
    },
    setRunning: (value: boolean | ((current: boolean) => boolean)) => {
      running = typeof value === 'function' ? value(running) : value;
    },
    setActivity: (value: string | ((current: string) => string)) => {
      activity = typeof value === 'function' ? value(activity) : value;
    },
    setToolCalls: (value: ToolCallInfo[] | ((current: ToolCallInfo[]) => ToolCallInfo[])) => {
      toolCalls = typeof value === 'function' ? value(toolCalls) : value;
    },
    setQueue: (value: QueuedItem[] | ((current: QueuedItem[]) => QueuedItem[])) => {
      queue = typeof value === 'function' ? value(queue) : value;
      queueRef.current = queue;
    },
    dispatchUserMessage,
    worklists: createWorklistStore(),
  };
  const deps = new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : noop),
  });
  const handler = createMessageHandler(deps as never);
  return {
    handler,
    dispatchUserMessage,
    seedQueue(items: QueuedItem[]) {
      queue = items;
      queueRef.current = items;
    },
    read: () => ({ messages, running, activity, toolCalls, queue }),
  };
}

describe('SimpleUI active-session message isolation', () => {
  it('accepts the active delta and drops a foreign-session delta', () => {
    const h = harness();
    h.handler({
      type: 'provider.text_delta',
      payload: { sessionId: 'session-a', text: 'mine', messageId: 'current' },
    } as never);
    h.handler.flush();
    h.handler({
      type: 'provider.text_delta',
      payload: { sessionId: 'session-b', text: '-foreign', messageId: 'current' },
    } as never);
    h.handler.flush();
    expect(h.read().messages.map((message) => message.text)).toEqual(['mine']);
  });

  it('does not let a foreign response settle the active stream', () => {
    const h = harness();
    h.handler({
      type: 'provider.text_delta',
      payload: { sessionId: 'session-a', text: 'active', messageId: 'current' },
    } as never);
    h.handler.flush();
    h.handler({
      type: 'provider.response',
      payload: { sessionId: 'session-b', content: 'foreign', stopReason: 'end_turn' },
    } as never);
    expect(h.read().messages).toEqual([
      expect.objectContaining({ text: 'active', streaming: true }),
    ]);
  });

  it('does not let foreign terminal frames stop the run or drain its queue', () => {
    const h = harness();
    h.seedQueue([{ id: 'q1', text: 'later', mode: 'queue', addedAt: 1 }]);
    h.handler({ type: 'iteration.started', payload: { sessionId: 'session-a' } } as never);
    h.handler({ type: 'run.result', payload: { sessionId: 'session-b', status: 'done' } } as never);
    h.handler({ type: 'error', payload: { sessionId: 'session-b', message: 'foreign' } } as never);
    expect(h.read().running).toBe(true);
    expect(h.read().queue).toHaveLength(1);
    expect(h.dispatchUserMessage).not.toHaveBeenCalled();

    h.handler({ type: 'run.result', payload: { sessionId: 'session-a', status: 'done' } } as never);
    expect(h.read().running).toBe(false);
    expect(h.dispatchUserMessage).toHaveBeenCalledWith('later');
  });
});
