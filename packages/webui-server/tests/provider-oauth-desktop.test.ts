import type {
  ProviderAuthOutcome,
  ProviderAuthSession,
  ProviderConfig,
} from '@wrongstack/contracts/types';
import { describe, expect, it, vi } from 'vitest';
import { projectSavedProviders } from '../src/server/provider/projection.js';
import { createProviderOperations } from '../src/server/provider-handlers.js';
import { handleProviderRoute } from '../src/server/provider-routes.js';

const outcome = (providerId: string): ProviderAuthOutcome => ({
  providerId,
  family: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  models: ['fixture-model'],
  credential: {
    label: 'oauth-default',
    apiKey: 'fixture-access-token-not-real',
    refreshToken: 'fixture-refresh-not-real',
    authMethod: 'oauth',
    expiresAt: '2030-01-01T00:00:00Z',
    createdAt: '2026-10-27T00:00:00Z',
  },
});
function harness() {
  let saved: Record<string, ProviderConfig> = {};
  const messages: { type: string; payload: Record<string, unknown> }[] = [];
  const sessions: ProviderAuthSession[] = [];
  const registry = {
    list: () => [
      {
        id: 'fixture',
        providerId: 'fixture-provider',
        label: 'Fixture account',
        interactionTypes: ['browser'],
      },
    ],
    resolveId: (kind: string) => (kind === 'fixture' ? 'fixture' : undefined),
    begin: async () => {
      const session: ProviderAuthSession = {
        strategyId: 'fixture',
        providerId: 'fixture-provider',
        interaction: { type: 'browser', authorizeUrl: 'https://example.test/login', bound: false },
        waitForCompletion: async () => null,
        completeWithCode: vi.fn(async () => outcome('fixture-provider')),
        close: vi.fn(),
      };
      sessions.push(session);
      return session;
    },
  };
  const operations = createProviderOperations({
    providerStore: {
      load: async () => saved,
      save: async (providers) => {
        saved = providers;
      },
    },
    providerAuthRegistry: registry as never,
    send: (socket, frame) => socket.send(JSON.stringify(frame)),
    broadcast: vi.fn(),
  });
  const ws = { readyState: 1, send: (data: string) => messages.push(JSON.parse(data)) };
  const call = async (type: string, payload: Record<string, unknown>) => {
    await handleProviderRoute(
      ws as never,
      { type, payload } as never,
      { providerHandlers: operations } as never,
    );
    return messages.at(-1)!;
  };
  return { call, messages, sessions, saved: () => saved };
}
describe('desktop OAuth attempts through production routes', () => {
  it('correlates metadata and refuses stale code/cancel without closing the replacement sign-in', async () => {
    const h = harness();
    expect((await h.call('auth.oauth.list', { requestId: 'list' })).payload).toMatchObject({
      requestId: 'list',
      providers: [expect.objectContaining({ id: 'fixture' })],
    });
    await h.call('auth.oauth.start', {
      kind: 'fixture',
      providerId: 'old-account',
      attemptId: 'first',
      requestId: 'start-one',
    });
    expect(h.messages.at(-1)?.payload).toMatchObject({
      requestId: 'start-one',
      attemptId: 'first',
      phase: 'awaiting_browser',
    });
    await h.call('auth.oauth.start', {
      kind: 'fixture',
      providerId: 'new-account',
      attemptId: 'second',
      requestId: 'start-two',
    });
    expect(h.sessions[0]!.close).toHaveBeenCalledOnce();
    const rejected = await h.call('auth.oauth.cancel', {
      kind: 'fixture',
      attemptId: 'first',
      requestId: 'cancel-old',
    });
    expect(rejected.payload).toMatchObject({
      attemptId: 'first',
      requestId: 'cancel-old',
      phase: 'error',
    });
    expect(h.sessions[1]!.close).not.toHaveBeenCalled();
    await h.call('auth.oauth.code', {
      kind: 'fixture',
      input: 'fixture-code',
      attemptId: 'first',
      requestId: 'code-old',
    });
    expect(h.sessions[1]!.completeWithCode).not.toHaveBeenCalled();
    await h.call('auth.oauth.code', {
      kind: 'fixture',
      input: 'fixture-code',
      attemptId: 'second',
      requestId: 'code-new',
    });
    expect(h.messages.at(-1)?.payload).toMatchObject({
      requestId: 'code-new',
      attemptId: 'second',
      phase: 'success',
      providerId: 'new-account',
    });
    expect(h.saved()['old-account']).toBeUndefined();
    expect(h.saved()['new-account']?.apiKeys?.[0]?.authMethod).toBe('oauth');
    expect(h.sessions[1]!.close).toHaveBeenCalledOnce();
  });
  it('cancels only the owned attempt and rejects malformed identities before beginning', async () => {
    const h = harness();
    await h.call('auth.oauth.start', {
      kind: 'fixture',
      attemptId: '../invalid',
      requestId: 'bad',
    });
    expect(h.sessions).toHaveLength(0);
    await h.call('auth.oauth.start', { kind: 'fixture', attemptId: 'owned', requestId: 'start' });
    await h.call('auth.oauth.cancel', { kind: 'fixture', attemptId: 'owned', requestId: 'cancel' });
    expect(h.sessions[0]!.close).toHaveBeenCalledOnce();
    expect(h.messages.at(-1)?.payload).toMatchObject({
      attemptId: 'owned',
      requestId: 'cancel',
      message: 'Sign-in cancelled.',
    });
    expect(h.saved()).toEqual({});
  });
  it('projects credential method and expiry without refresh/access tokens', () => {
    const auth = outcome('fixture');
    const view = projectSavedProviders({
      fixture: { type: 'openai-compatible', apiKeys: [auth.credential] },
    });
    expect(view[0]?.apiKeys[0]).toMatchObject({
      authMethod: 'oauth',
      expiresAt: auth.credential.expiresAt,
    });
    expect(JSON.stringify(view)).not.toContain(auth.credential.apiKey);
    expect(JSON.stringify(view)).not.toContain(auth.credential.refreshToken);
  });
});
