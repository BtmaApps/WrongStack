import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverOpenAICompatibleModels, resolveDiscoveryTargets } from '../src/auto-discover.js';
import { GitHubCopilotProvider } from '../src/github-copilot.js';
import { fetchCopilotModels, isUsableCopilotChatModel } from '../src/github-copilot-models.js';
import { applyProviderAuthOutcome } from '../src/oauth/apply-outcome.js';

const chat = (id: string, extra = {}) => ({
  id,
  name: `Display ${id}`,
  model_picker_enabled: true,
  capabilities: {
    type: 'chat',
    supports: { tool_calls: true },
    limits: { max_context_window_tokens: 321000 },
  },
  ...extra,
});
afterEach(() => vi.unstubAllGlobals());

describe('Copilot account catalogs', () => {
  it('retains account models with an entity type tag and actual context/name metadata', async () => {
    const discovered = await discoverOpenAICompatibleModels('account-kimi', {
      baseUrl: 'https://api.kimi.ai/coding/v1',
      accountCatalog: true,
      fetchImpl: async () =>
        Response.json({
          data: [
            {
              id: 'account-next-kimi',
              type: 'model',
              display_name: 'Account next Kimi',
              context_length: 765000,
              modalities: { output: ['text'] },
            },
          ],
        }),
    });
    expect(discovered?.models).toEqual({
      'account-next-kimi': expect.objectContaining({
        id: 'account-next-kimi',
        name: 'Account next Kimi',
        limit: { context: 765000 },
      }),
    });
  });
  it('retains newly released visible IDs, excludes hidden/internal/disabled and unsupported wires, and uses server default order', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [
          chat('fresh-model'),
          chat('internal', { model_picker_enabled: false }),
          chat('disabled', { policy: { state: 'disabled' } }),
          chat('hidden-fallback', { model_picker_enabled: false, is_chat_fallback: true }),
          chat('responses-only', { supported_endpoints: ['/responses'] }),
          chat('server-default', { model_picker_enabled: false, is_chat_default: true }),
          chat('fresh-model'),
        ],
      }),
    );
    const models = await fetchCopilotModels('token', undefined, fetchImpl);
    expect(models?.map((m) => m.id)).toEqual(['server-default', 'fresh-model']);
    expect(models?.[1]).toMatchObject({ name: 'Display fresh-model', maxContext: 321000 });
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(isUsableCopilotChatModel(chat('new-name'))).toBe(true);
  });

  it('distinguishes authoritative empty data from unavailable or malformed responses without inventing IDs', async () => {
    expect(
      await fetchCopilotModels('token', undefined, async () => Response.json({ data: [] })),
    ).toEqual([]);
    expect(
      await fetchCopilotModels('token', undefined, async () => Response.json({ data: null })),
    ).toBeUndefined();
    expect(
      await fetchCopilotModels('token', undefined, async () => new Response('', { status: 503 })),
    ).toBeUndefined();
  });

  it('refreshes and publishes runtime context/catalog metadata using the current account token', async () => {
    const onModels = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ data: [chat('fresh-model')] }),
    );
    const provider = new GitHubCopilotProvider({
      credentials: { copilotToken: 'token', expiresAt: Date.now() + 3600000 },
      fetchImpl,
      onModels,
    });
    expect(
      await provider.refreshContextLimit('fresh-model', { signal: new AbortController().signal }),
    ).toEqual({ maxContext: 321000, source: 'provider' });
    await provider.refreshContextLimit('fresh-model', { signal: new AbortController().signal });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onModels).toHaveBeenCalledWith([expect.objectContaining({ id: 'fresh-model' })]);
  });

  it('discovers OAuth aliases authoritatively, isolates account caches, and clears stale lists after reauthorization', async () => {
    const cfg = {
      type: 'github-copilot',
      family: 'github-copilot' as const,
      apiKeys: [
        {
          label: 'personal',
          apiKey: 'token',
          refreshToken: 'account-a',
          createdAt: '',
          authMethod: 'oauth' as const,
        },
      ],
      activeKey: 'personal',
      models: ['stale'],
    };
    const target = resolveDiscoveryTargets({ providers: { alias: cfg } } as never)[0]!;
    expect(target).toMatchObject({
      id: 'alias',
      modelDiscoveryAuthoritative: true,
      accountCatalog: true,
      copilotCatalog: true,
    });
    expect(target.cacheKey).not.toContain('account-a');
    const changed = { ...cfg, apiKeys: [{ ...cfg.apiKeys[0]!, refreshToken: 'account-b' }] };
    expect(
      resolveDiscoveryTargets({ providers: { alias: changed } } as never)[0]?.cacheKey,
    ).not.toBe(target.cacheKey);
    expect(
      await discoverOpenAICompatibleModels('alias', {
        ...target,
        fetchImpl: async () => Response.json({ data: [] }),
      }),
    ).toMatchObject({ models: {} });
    const providers = { alias: cfg };
    applyProviderAuthOutcome(
      providers,
      {
        providerId: 'github-copilot',
        family: 'github-copilot',
        models: [],
        credential: cfg.apiKeys[0]!,
      },
      { targetProviderId: 'alias' },
    );
    expect(providers.alias.models).toEqual([]);
  });
});
