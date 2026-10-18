import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeMessage, draftKey, initialState, reduceFrame } from '../src/lib/session';
import { SessionSwitch } from '../src/lib/session-switch';
import { STABLE_CONNECTION_MS, socketUrl, TOKEN_KEY, VibeTransport } from '../src/lib/transport';

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
  it('keeps live entry ids unique after the message and tool caps are reached', () => {
    let state = reduceFrame(initialState(), start());
    const seen = new Set<string>();
    for (let turn = 0; turn < 650; turn++) {
      state = reduceFrame(state, {
        type: 'tool.started',
        payload: { id: `tool-${turn}`, name: 'read', input: {} },
      });
      state = reduceFrame(state, {
        type: 'provider.response',
        payload: { content: [{ type: 'text', text: `answer ${turn}` }], stopReason: 'end_turn' },
      });
      const last = state.messages.at(-1);
      if (last) {
        expect(seen.has(last.id)).toBe(false);
        seen.add(last.id);
      }
    }
    expect(state.messages).toHaveLength(500);
    expect(new Set(state.messages.map((m) => m.id)).size).toBe(state.messages.length);
  });
});

describe('pending session open (use-session switch state)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('releases target and deadline together when an error ends a pending clear', () => {
    const pending = new SessionSwitch();
    const onTimeout = vi.fn();
    pending.begin('one', 30_000, onTimeout);
    expect(pending.accepts('two')).toBe(false);
    // use-session handles an `error` frame while a switch/clear is pending.
    expect(pending.cancel().pending).toBe(true);
    expect(pending.active).toBe(false);
    expect(pending.accepts('two')).toBe(true);
    vi.advanceTimersByTime(60_000);
    // The abandoned deadline must not fire later and re-lock the UI.
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does not keep filtering sessions after a failed resume on reconnect', () => {
    const pending = new SessionSwitch();
    pending.begin('one', 30_000, () => {});
    // The server refuses the resume with an error frame.
    pending.cancel();
    expect(pending.desired).toBe('');
    expect(pending.accepts('new-session')).toBe(true);
  });

  it('releases the target when a reconnect resume is never answered', () => {
    const pending = new SessionSwitch();
    const onTimeout = vi.fn();
    pending.begin('one', 30_000, onTimeout);
    vi.advanceTimersByTime(30_000);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(pending.active).toBe(false);
    expect(pending.accepts('new-session')).toBe(true);
  });

  it('falls back to the attached session when a saved-session restore fails', () => {
    const pending = new SessionSwitch<string>();
    pending.begin('saved', 15_000, () => {});
    pending.hold('attached-session-start');
    expect(pending.cancel().held).toBe('attached-session-start');
  });

  it('a new open replaces the previous deadline instead of stacking it', () => {
    const pending = new SessionSwitch();
    const first = vi.fn();
    pending.begin('one', 30_000, first);
    pending.begin('two', 30_000, () => {});
    vi.advanceTimersByTime(30_000);
    expect(first).not.toHaveBeenCalled();
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

describe('VibeTransport reconnect and stored credential', () => {
  class FakeSocket {
    static readonly OPEN = 1;
    static instances: FakeSocket[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: URL) {
      FakeSocket.instances.push(this);
    }
    open() {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    }
    send() {}
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.();
    }
  }
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter factor exactly 1
    FakeSocket.instances = [];
    storage = new Map();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('document', { querySelector: () => null });
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        host: '127.0.0.1:3476',
        search: '',
        href: 'http://127.0.0.1:3476/',
      },
      history: { state: null, replaceState: () => {} },
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const transport = () => new VibeTransport({ onState: () => {}, onMessage: () => {} });

  it('keeps backing off when the server accepts and immediately drops the socket', async () => {
    const client = transport();
    await client.connect();
    FakeSocket.instances[0]?.open();
    FakeSocket.instances[0]?.close(); // first retry after 750 ms
    await vi.advanceTimersByTimeAsync(750);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]?.open();
    FakeSocket.instances[1]?.close(); // unstable open: next retry needs 1500 ms
    await vi.advanceTimersByTimeAsync(750);
    expect(FakeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(750);
    expect(FakeSocket.instances).toHaveLength(3);
    client.close();
  });

  it('resets the backoff once a connection has stayed open', async () => {
    const client = transport();
    await client.connect();
    FakeSocket.instances[0]?.close();
    await vi.advanceTimersByTimeAsync(750);
    FakeSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS);
    FakeSocket.instances[1]?.close();
    await vi.advanceTimersByTimeAsync(750);
    expect(FakeSocket.instances).toHaveLength(3);
    client.close();
  });

  it('clears a stored token that /ws-auth rejects and does not resend it', async () => {
    storage.set(TOKEN_KEY, 'stale-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 })),
    );
    const client = transport();
    await client.connect();
    expect(storage.has(TOKEN_KEY)).toBe(false);
    expect(FakeSocket.instances[0]?.url.searchParams.has('token')).toBe(false);
    client.close();
  });

  it('keeps a stored token when /ws-auth is merely unreachable', async () => {
    storage.set(TOKEN_KEY, 'good-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const client = transport();
    await client.connect();
    expect(storage.get(TOKEN_KEY)).toBe('good-token');
    client.close();
  });
});
