// @vitest-environment node

/**
 * React runs a queued `setState(updater)` during render, after the calling
 * handler has returned. The shared message-handler harness applies updaters
 * eagerly, so it cannot see a handler whose updater reads mutable handler
 * state that is reset on the next statement. This file defers updaters the way
 * React does.
 */
import { describe, expect, it } from 'vitest';
import { createMessageHandler } from '../src/lib/message-handler.js';
import { DEFAULT_PREFS } from '../src/lib/prefs-model.js';
import { createWorklistStore } from '../src/lib/worklist-store.js';
import type { ChatMessage } from '../src/types.js';

function deferredSession() {
  let messages: ChatMessage[] = [];
  const pending: Array<() => void> = [];
  const setMessages = (value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])): void => {
    pending.push(() => {
      messages = typeof value === 'function' ? value(messages) : value;
    });
  };
  const noop = (): void => undefined;
  const base: Record<string, unknown> = {
    prefsRef: { current: { ...DEFAULT_PREFS, chime: false } },
    queueRef: { current: [] },
    sessionIdRef: { current: 's1' },
    setMessages,
    dispatchUserMessage: () => true,
    worklists: createWorklistStore(),
  };
  const deps = new Proxy(base, {
    get: (target, key: string) => (key in target ? target[key] : noop),
  });
  const handler = createMessageHandler(deps as never);
  return {
    handler,
    seed: (rows: ChatMessage[]) => {
      messages = [...rows];
    },
    commit: () => {
      for (const apply of pending.splice(0)) apply();
      return messages;
    },
  };
}

describe('run.result structured nextsteps fallback with a deferred updater', () => {
  it('keeps the steps when React applies the updater after the handler returned', () => {
    const { handler, commit } = deferredSession();
    handler({
      type: 'tool.started',
      payload: {
        id: 'n1',
        name: 'nextsteps',
        input: {
          steps: [{ text: 'Run the focused tests', auto: true }, { text: 'Review the diff' }],
        },
      },
    } as never);
    handler({ type: 'tool.executed', payload: { id: 'n1', name: 'nextsteps', ok: true } } as never);
    handler({ type: 'run.result', payload: { status: 'done' } } as never);

    expect(commit().at(-1)).toMatchObject({
      role: 'assistant',
      final: true,
      nextSteps: [
        { index: 1, text: 'Run the focused tests', auto: true },
        { index: 2, text: 'Review the diff' },
      ],
    });
  });

  it('does not replay the previous run steps on a later run.result', () => {
    const { handler, commit } = deferredSession();
    handler({
      type: 'tool.started',
      payload: { id: 'n2', name: 'nextsteps', input: { steps: [{ text: 'Only step' }] } },
    } as never);
    handler({ type: 'tool.executed', payload: { id: 'n2', name: 'nextsteps', ok: true } } as never);
    handler({ type: 'run.result', payload: { status: 'done' } } as never);
    const rows = commit().length;
    handler({ type: 'run.result', payload: { status: 'done' } } as never);
    expect(commit()).toHaveLength(rows);
  });
});

describe('run.result structured nextsteps fallback is scoped to the current turn', () => {
  const oldTurn: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'first question' },
    {
      id: 'a1',
      role: 'assistant',
      final: true,
      text: 'Done.\n<nextsteps>\n1. Old suggestion\n</nextsteps>',
    },
    { id: 'u2', role: 'user', text: 'second question' },
  ];

  function endRunWithToolSteps(session: ReturnType<typeof deferredSession>): void {
    session.handler({
      type: 'tool.started',
      payload: { id: 'n3', name: 'nextsteps', input: { steps: [{ text: 'Ship it' }] } },
    } as never);
    session.handler({
      type: 'tool.executed',
      payload: { id: 'n3', name: 'nextsteps', ok: true },
    } as never);
  }

  it('still appends the fallback row after an earlier turn rendered suggestions', () => {
    const session = deferredSession();
    session.seed(oldTurn);
    endRunWithToolSteps(session);
    session.handler({ type: 'run.result', payload: { status: 'done' } } as never);
    expect(session.commit().at(-1)).toMatchObject({
      role: 'assistant',
      final: true,
      nextSteps: [{ index: 1, text: 'Ship it' }],
    });
  });

  it('does not duplicate when this turn reply already carries the block', () => {
    const session = deferredSession();
    session.seed(oldTurn);
    endRunWithToolSteps(session);
    session.handler({
      type: 'provider.response',
      payload: { content: 'Ok.\n<nextsteps>\n1. Ship it\n</nextsteps>', iteration: 1 },
    } as never);
    session.handler({ type: 'run.result', payload: { status: 'done' } } as never);
    const rows = session.commit();
    expect(rows.filter((row) => row.text === '' && row.nextSteps?.length)).toHaveLength(0);
  });
});

describe('provider.retry discards the abandoned partial reply', () => {
  const FULL = 'Hello world, this is the full answer.';

  it('does not append the re-streamed reply onto the failed attempt', () => {
    const session = deferredSession();
    session.handler({ type: 'provider.text_delta', payload: { text: 'Hello wor' } } as never);
    session.handler.flush();
    session.commit();
    session.handler({
      type: 'provider.retry',
      payload: {
        providerId: 'p',
        attempt: 1,
        delayMs: 500,
        status: 529,
        description: 'overloaded',
      },
    } as never);
    session.handler({ type: 'provider.text_delta', payload: { text: FULL } } as never);
    session.handler.flush();
    session.handler({
      type: 'provider.response',
      payload: { content: FULL, stopReason: 'end_turn', iteration: 1 },
    } as never);
    const assistants = session.commit().filter((row) => row.role === 'assistant');
    expect(assistants.map((row) => row.text)).toEqual([FULL]);
  });
});

describe('provider.fallback discards the abandoned partial reply', () => {
  const FULL = 'Hello world, this is the full answer.';
  const hop = {
    sessionId: 's1',
    from: { providerId: 'a', model: 'm1' },
    to: { providerId: 'b', model: 'm2' },
    status: 529,
  };

  it('does not append the fallback model reply onto the failed model partial', () => {
    const session = deferredSession();
    session.handler({ type: 'provider.text_delta', payload: { text: 'Hello wor' } } as never);
    session.handler.flush();
    session.commit();
    session.handler({ type: 'provider.fallback', payload: hop } as never);
    session.handler({ type: 'provider.text_delta', payload: { text: FULL } } as never);
    session.handler.flush();
    session.handler({
      type: 'provider.response',
      payload: { content: FULL, stopReason: 'end_turn', iteration: 1 },
    } as never);
    const assistants = session.commit().filter((row) => row.role === 'assistant');
    expect(assistants.map((row) => row.text)).toEqual([FULL]);
  });

  it('ignores a fallback announced for another session', () => {
    const session = deferredSession();
    session.handler({ type: 'provider.text_delta', payload: { text: 'mine' } } as never);
    session.handler.flush();
    session.commit();
    session.handler({
      type: 'provider.fallback',
      payload: { ...hop, sessionId: 'other' },
    } as never);
    const rows = session.commit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: 'mine', streaming: true });
  });
});
