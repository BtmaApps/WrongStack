import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createEmbeddedProviderOperations,
  handleProviderRoute,
  type ProviderRouteHandlers,
} from '@wrongstack/webui-server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import {
  createProviderConfigStore,
  loadSavedProviders,
} from '../../src/webui-server/provider-config.js';

/**
 * The WebUI provider panel end to end on the CLI-embedded host: the real
 * store (bound to a frozen boot Config, as `ConfigLoader.load()` returns),
 * the real provider operations and the real route dispatcher. Every step
 * must answer the asking request and leave the profile file in that state.
 */
describe('embedded WebUI provider CRUD round trip', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ws-provider-crud-'));
    configPath = path.join(dir, 'config.json');
    fsSync.writeFileSync(
      configPath,
      JSON.stringify({ providers: { anthropic: { type: 'anthropic', apiKey: 'boot-key' } } }),
    );
  });

  afterEach(() => {
    fsSync.rmSync(dir, { recursive: true, force: true });
  });

  const harness = (authRegistry?: unknown) => {
    const bootConfig = Object.freeze({
      providers: { anthropic: { type: 'anthropic', apiKey: 'boot-key' } },
    });
    const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const operations = createEmbeddedProviderOperations({
      providerStore: createProviderConfigStore(configPath, () => bootConfig.providers as never),
      send: (_ws, message) => sent.push(message as never),
      broadcast: () => undefined,
      ...(authRegistry ? { providerAuthRegistry: authRegistry } : {}),
    } as never);
    const routes = {
      providerHandlers: operations,
      adoptDefaultProviderIfUnset: async () => undefined,
    } as unknown as ProviderRouteHandlers;
    const ws = {} as WebSocket;
    let counter = 0;
    const dispatch = (type: string, payload: Record<string, unknown>) =>
      handleProviderRoute(ws, { type, payload } as never, routes);
    const run = async (type: string, payload: Record<string, unknown>) => {
      const requestId = `req-${++counter}`;
      await dispatch(type, { ...payload, requestId });
      const result = sent.find(
        (m) => m.type === 'key.operation_result' && m.payload['requestId'] === requestId,
      );
      expect(result, `${type} answered its request`).toBeDefined();
      expect(result?.payload['success'], `${type}: ${String(result?.payload['message'])}`).toBe(
        true,
      );
    };
    return { sent, dispatch, run };
  };

  it('adds, keys, switches, deletes keys, updates and removes providers across saves', async () => {
    const { run } = harness();

    // Catalog card: alias + key, catalog id as `type`.
    await run('provider.add', {
      id: 'openai-work',
      family: 'openai',
      type: 'openai',
      apiKey: 'k1',
    });
    await run('key.add', { providerId: 'openai-work', label: 'second', apiKey: 'k2' });
    await run('key.set_active', { providerId: 'openai-work', label: 'second' });
    await run('key.delete', { providerId: 'openai-work', label: 'default' });
    await run('provider.update', { id: 'openai-work', models: ['gpt-test'] });
    // A provider that was on disk at boot stays editable after other saves.
    await run('key.add', { providerId: 'anthropic', label: 'extra', apiKey: 'k3' });

    let disk = await loadSavedProviders(configPath);
    expect(disk['openai-work']?.apiKeys?.map((k) => k.label)).toEqual(['second']);
    expect(disk['openai-work']?.activeKey).toBe('second');
    expect(disk['openai-work']?.models).toEqual(['gpt-test']);
    expect(disk['anthropic']?.apiKeys?.some((k) => k.label === 'extra')).toBe(true);

    await run('provider.remove', { providerId: 'openai-work' });
    await run('provider.remove', { providerId: 'anthropic' });
    disk = await loadSavedProviders(configPath);
    expect(disk).toEqual({});
  });

  it('signs in two OAuth accounts, deletes one and then removes the provider', async () => {
    let account = 0;
    const strategy = {
      id: 'fake-oauth',
      providerId: 'fake-sub',
      label: 'Fake subscription',
      interactionTypes: ['browser'] as const,
    };
    const registry = {
      resolveId: (input: string) => (input === strategy.id ? strategy.id : undefined),
      get: () => strategy,
      list: () => [strategy],
      begin: async () => {
        const label = `acct-${++account}`;
        return {
          strategyId: strategy.id,
          providerId: strategy.providerId,
          interaction: { type: 'browser', authorizeUrl: 'https://example.test/auth', bound: false },
          waitForCompletion: async () => null,
          completeWithCode: async () => ({
            providerId: strategy.providerId,
            family: 'openai',
            models: ['sub-model'],
            credential: {
              label,
              apiKey: `token-${label}`,
              authMethod: 'oauth',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          }),
          close: () => undefined,
        };
      },
    };
    const { sent, dispatch, run } = harness(registry);
    const signIn = async () => {
      await dispatch('auth.oauth.start', { kind: strategy.id });
      await dispatch('auth.oauth.code', { kind: strategy.id, input: 'code' });
      const status = sent.filter((m) => m.type === 'auth.oauth.status').at(-1);
      expect(status?.payload['phase'], String(status?.payload['message'])).toBe('success');
    };

    await signIn();
    await signIn();
    let disk = await loadSavedProviders(configPath);
    expect(disk['fake-sub']?.apiKeys?.map((k) => k.label)).toEqual(['acct-1', 'acct-2']);
    expect(disk['fake-sub']?.activeKey).toBe('acct-2');

    await run('key.delete', { providerId: 'fake-sub', label: 'acct-1' });
    disk = await loadSavedProviders(configPath);
    expect(disk['fake-sub']?.apiKeys?.map((k) => k.label)).toEqual(['acct-2']);

    await run('provider.remove', { providerId: 'fake-sub' });
    expect((await loadSavedProviders(configPath))['fake-sub']).toBeUndefined();
  });
});
