/**
 * In `wstack --webui` the embedded WebUI credential watcher and the CLI host's
 * provider-runtime watcher observe the same config file and share the host
 * context. The host owns `context.provider` (layer merge, removed-account block,
 * WrongProxy/WrongTrace rewrite); the embedded watcher used to rebuild it with a
 * bare factory call from its own debounce and, landing last, dropped the proxy.
 * It must refresh panels/config only and leave the provider alone.
 */
import { applyProxyConfig } from '@wrongstack/core/wiring/proxy-rewrite';
import { makeProviderFromConfig, unavailableProviderCredentials } from '@wrongstack/providers';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  onChange: undefined as ((snapshot: unknown) => void) | undefined,
}));

vi.mock('@wrongstack/core/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/core/storage')>()),
  watchProviderConfig: (_path: string, _vault: unknown, onChange: (snapshot: unknown) => void) => {
    captured.onChange = onChange;
    return { close: () => undefined };
  },
}));

import { startWebuiCredentialWatcher } from '../src/webui-server/credential-watcher.js';

const PROXY = 'http://127.0.0.1:7777';
const deepseek = (apiKey: string) => ({
  type: 'deepseek',
  family: 'openai-compatible',
  apiKey,
  baseUrl: 'https://api.deepseek.com/v1',
});

function start(provider: unknown) {
  const ctx = { provider, meta: {} as Record<string, unknown> };
  const saved: unknown[] = [];
  startWebuiCredentialWatcher({
    opts: {
      appConfig: { providers: { deepseek: deepseek('sk-old') } },
      agent: { ctx, container: { safeResolve: () => undefined } },
      globalConfigPath: 'C:/tmp/webui-watcher/config.json',
    } as never,
    profileConfigPath: 'C:/tmp/webui-watcher/profiles/default/config.json',
    broadcast: () => undefined,
    broadcastSaved: (providers) => saved.push(providers),
  });
  return { ctx, saved };
}

afterEach(() => {
  applyProxyConfig({ enabled: false, url: '', active: false });
});

describe('embedded WebUI credential watcher', () => {
  it("keeps the host's proxied provider after a key rotation", () => {
    applyProxyConfig({ enabled: true, url: PROXY, active: true });
    const hostProvider = makeProviderFromConfig('deepseek', {
      ...deepseek('sk-new'),
      baseUrl: PROXY,
    } as never);
    const { ctx, saved } = start(hostProvider);

    captured.onChange?.({
      providers: { deepseek: deepseek('sk-new') },
      snapshotHasProviders: true,
    });

    expect(ctx.provider).toBe(hostProvider);
    expect(saved).toHaveLength(1);
  });

  it('keeps a removed account blocked', () => {
    const blocked = unavailableProviderCredentials('deepseek', {} as never);
    const { ctx } = start(blocked);

    captured.onChange?.({ providers: {}, snapshotHasProviders: true });

    expect(ctx.provider).toBe(blocked);
  });
});
