import { describe, expect, it } from 'vitest';
import { composeMessage, draftKey, initialState, reduceFrame } from '../src/lib/session';
import { socketUrl } from '../src/lib/transport';

const start = (sessionId = 'one') => ({
  type: 'session.start',
  payload: {
    sessionId,
    provider: 'configured-provider',
    model: 'account-model',
    projectName: 'Project',
    maxContext: 10000,
  },
});

describe('VibeUI conversation', () => {
  it('keeps replayed runtime context out of authored user text', () => {
    const state = reduceFrame(initialState(), {
      ...start(),
      payload: {
        ...start().payload,
        replayMessages: [
          {
            role: 'user',
            origin: 'user_input',
            authoredLength: 1,
            content: [
              { type: 'text', text: 'My request' },
              { type: 'text', text: '[TOOL COACH — inspect before changing]\nRead first.' },
            ],
          },
        ],
      },
    });
    expect(state.messages[0]).toMatchObject({
      role: 'user',
      text: 'My request',
      runtimeContext: ['[TOOL COACH — inspect before changing]\nRead first.'],
    });
  });
  it('keeps streaming through a human BTW note and settles the same answer once', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { sessionId: 'one', text: 'Hello' },
    });
    state = {
      ...state,
      messages: [
        ...state.messages,
        { id: 'btw', role: 'user', delivery: 'btw', text: 'Also remember this' },
      ],
    };
    state = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { sessionId: 'one', text: ' world' },
    });
    state = reduceFrame(state, {
      type: 'provider.response',
      payload: {
        sessionId: 'one',
        content: [{ type: 'text', text: 'Hello world!' }],
        stopReason: 'end_turn',
      },
    });
    expect(state.messages.filter((message) => message.role === 'assistant')).toEqual([
      expect.objectContaining({ text: 'Hello world!', streaming: false }),
    ]);
    expect(state.messages[1]).toMatchObject({ delivery: 'btw', text: 'Also remember this' });
  });
  it('streams one answer, settles it with canonical text and stops at the run boundary', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { sessionId: 'one', text: 'Hello', messageId: 'm' },
    });
    state = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { sessionId: 'one', text: ' world', messageId: 'm' },
    });
    state = reduceFrame(state, {
      type: 'provider.response',
      payload: {
        sessionId: 'one',
        content: [{ type: 'text', text: 'Hello world!' }],
        stopReason: 'end_turn',
      },
    });
    state = reduceFrame(state, {
      type: 'run.result',
      payload: { sessionId: 'one', status: 'done', iterations: 1 },
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ text: 'Hello world!', streaming: false });
    expect(state.running).toBe(false);
  });
  it('isolates foreign session events, including approvals and diffs', () => {
    const state = reduceFrame(initialState(), start());
    for (const type of ['provider.text_delta', 'tool.confirm_needed', 'git.diff', 'error']) {
      expect(
        reduceFrame(state, {
          type,
          payload: {
            sessionId: 'other',
            text: 'foreign',
            id: 'approval',
            message: 'foreign error',
          },
        }),
      ).toBe(state);
    }
  });
  it('replaces replay on reconnect without duplicating old or streamed messages', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, { type: 'provider.text_delta', payload: { text: 'partial' } });
    const replay = {
      ...start(),
      payload: {
        ...start().payload,
        replayMessages: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: [{ type: 'text', text: 'Final answer' }] },
        ],
      },
    };
    state = reduceFrame(state, replay);
    state = reduceFrame(state, replay);
    expect(state.messages.map((m) => m.text)).toEqual(['Question', 'Final answer']);
  });
  it('clears pending prompts and worklists on a session switch', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, {
      type: 'tool.confirm_needed',
      payload: { id: 'a', toolName: 'bash' },
    });
    state = reduceFrame(state, {
      type: 'todos.updated',
      payload: { todos: [{ id: 't', content: 'Do work', status: 'pending' }] },
    });
    state = reduceFrame(state, start('two'));
    expect(state.confirm).toBeNull();
    expect(state.todos).toEqual([]);
  });
  it('keeps concurrent permission requests available in arrival order', () => {
    let state = reduceFrame(initialState(), start());
    for (const id of ['one', 'two', 'one'])
      state = reduceFrame(state, {
        type: 'tool.confirm_needed',
        payload: { id, toolName: 'write_file', input: {} },
      });
    expect(state.confirm?.id).toBe('one');
    expect(state.confirmQueue.map((c) => c.id)).toEqual(['two']);
    state = reduceFrame(state, { type: 'tool.confirm_resolved', payload: { id: 'one' } });
    expect(state.confirm?.id).toBe('two');
    expect(state.confirmQueue).toEqual([]);
  });
  it('ends a failed stream and keeps its error visible', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, { type: 'provider.text_delta', payload: { text: 'in progress' } });
    state = reduceFrame(state, { type: 'error', payload: { message: 'Provider unavailable' } });
    expect(state.running).toBe(false);
    expect(state.messages.at(-1)?.text).toBe('Provider unavailable');
    expect(state.messages.some((m) => m.streaming)).toBe(false);
  });
  it('projects real model, git and agent payloads without hardcoded model IDs', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, {
      type: 'provider.models',
      payload: {
        provider: 'account',
        models: [{ id: 'live-model', name: 'Live model', contextWindow: 4096 }],
      },
    });
    state = reduceFrame(state, {
      type: 'provider.model_switched',
      payload: { to: { provider: 'account', model: 'live-model' } },
    });
    state = reduceFrame(state, {
      type: 'git.changes',
      payload: { files: [{ path: 'src/app.ts', status: 'M', added: 8, deleted: 2 }] },
    });
    state = reduceFrame(state, {
      type: 'agent.status_changed',
      payload: { subagentId: 'worker', agentName: 'Worker', status: 'running' },
    });
    expect(state.model).toBe('live-model');
    expect(state.files[0]).toMatchObject({ additions: 8, deletions: 2 });
    expect(state.agents[0]?.name).toBe('Worker');
  });
  it('retains genuine context overflow and bounds streaming text', () => {
    let state = reduceFrame(initialState(), start());
    state = reduceFrame(state, {
      type: 'ctx.pct',
      payload: { load: 1.35, tokens: 13500, maxContext: 10000 },
    });
    expect(state.load).toBe(1.35);
    state = reduceFrame(state, {
      type: 'provider.text_delta',
      payload: { text: 'x'.repeat(600000) },
    });
    expect(state.messages[0]?.text.length).toBe(500000);
  });
  it('keeps question requests queued until the matching resolution arrives', () => {
    let state = reduceFrame(initialState(), start());
    for (const id of ['a', 'b', 'a'])
      state = reduceFrame(state, {
        type: 'user.input_requested',
        payload: {
          request: {
            id,
            title: 'Question',
            tabs: [
              {
                questions: [
                  {
                    id: 'q',
                    prompt: 'Choose',
                    required: true,
                    kind: 'single_select',
                    options: [{ id: 'x', label: 'X' }],
                  },
                ],
              },
            ],
          },
        },
      });
    expect(state.inputs.map((r) => r.id)).toEqual(['a', 'b']);
    state = reduceFrame(state, { type: 'user.input_resolved', payload: { requestId: 'a' } });
    expect(state.inputs.map((r) => r.id)).toEqual(['b']);
  });
});

describe('composer and connection', () => {
  it('composes unique file references and isolates session drafts', () => {
    expect(composeMessage(' Explain this ', ['src/a.ts', 'src/a.ts'])).toBe(
      'Explain this\n@src/a.ts',
    );
    expect(draftKey('one')).not.toBe(draftKey('two'));
  });
  it('preserves the page host and token for same-origin upgrades', () => {
    expect(
      socketUrl({ protocol: 'https:', host: 'localhost:3476', search: '?token=secret' }).toString(),
    ).toBe('wss://localhost:3476/?token=secret');
  });
  it('accepts configured websocket endpoints and rejects other protocols', () => {
    const location = { protocol: 'http:', host: '127.0.0.1:3476', search: '' };
    expect(socketUrl(location, 'ws://127.0.0.1:3477').port).toBe('3477');
    expect(socketUrl(location, 'https://other.test').host).toBe(location.host);
  });
});
