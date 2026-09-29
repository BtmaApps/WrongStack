import { describe, expect, it, vi } from 'vitest';
import { launchBuiltinRound, type RoundLauncherClient } from '../../src/lib/launch-builtin-round';

type Handler = (message: { payload: unknown }) => void;

function fakeClient() {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const client = {
    isConnected: true,
    on: (type: string, handler: Handler) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
    send: (message: { type: string; payload: Record<string, unknown> }) => {
      sent.push(message);
    },
    sendMessage: vi.fn(() => 'msg-1'),
  } as unknown as RoundLauncherClient;
  const emit = (type: string, payload: unknown) => handlers.get(type)?.({ payload });
  return { client, sent, emit };
}

function launch(client: RoundLauncherClient, keepCompanions?: boolean) {
  const onSettle = vi.fn();
  launchBuiltinRound({
    client,
    slug: 'proof-driven-bug-hunter',
    requireSoloSession: true,
    ...(keepCompanions !== undefined ? { keepCompanions } : {}),
    subagentsAllowed: true,
    sessionId: 's1',
    setPrefs: vi.fn(),
    compose: (content) => content,
    onSent: vi.fn(),
    onSettle,
    timeoutMs: 60_000,
  });
  return onSettle;
}

describe('launchBuiltinRound solo request', () => {
  it('asks for solo with companions when the round keeps them', () => {
    const { client, sent, emit } = fakeClient();
    const onSettle = launch(client, true);

    expect(sent[0]).toEqual({
      type: 'prefs.update',
      payload: { subagentsAllowed: false, subagentCompanionsAllowed: true, sessionId: 's1' },
    });

    emit('prefs.updated', { sessionId: 's1', subagentsAllowed: false });
    expect(sent[1]).toEqual({
      type: 'prompts.content',
      payload: { slug: 'proof-driven-bug-hunter' },
    });
    emit('prompts.content', { slug: 'proof-driven-bug-hunter', found: true, content: 'hunt' });
    expect(onSettle).toHaveBeenCalledWith('idle');
  });

  it('asks for strict solo by default', () => {
    const { client, sent } = fakeClient();
    launch(client);

    expect(sent[0]?.payload).toEqual({ subagentsAllowed: false, sessionId: 's1' });
  });
});
