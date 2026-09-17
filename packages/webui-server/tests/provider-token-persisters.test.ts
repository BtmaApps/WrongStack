import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultSecretVault } from '@wrongstack/core/security';
import type {
  OAuthRefreshedTokens,
  ProviderCredentialSource,
  ProviderLiveModel,
} from '@wrongstack/providers';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  oauth: undefined as
    | ((id: string, tokens: OAuthRefreshedTokens, source?: ProviderCredentialSource) => void)
    | undefined,
  models: undefined as
    | ((id: string, models: ProviderLiveModel[], source?: ProviderCredentialSource) => void)
    | undefined,
}));
vi.mock('@wrongstack/providers', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  setOAuthTokenPersister: (fn: typeof hooks.oauth) => {
    hooks.oauth = fn;
  },
  setProviderModelPersister: (fn: typeof hooks.models) => {
    hooks.models = fn;
  },
}));

import {
  loadSavedProviders,
  mutateSavedProviders,
  saveProviders,
} from '../src/server/provider-config-io.js';
import { installWebuiProviderPersisters } from '../src/server/provider-token-persisters.js';

let dir: string;
let configPath: string;
let vault: DefaultSecretVault;
const warn = vi.fn();
const source = { label: 'a', accessToken: 'old-access', refreshToken: 'old-refresh' };
beforeEach(async () => {
  warn.mockClear();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-token-'));
  configPath = path.join(dir, 'config.json');
  vault = new DefaultSecretVault({ keyFile: path.join(dir, '.key') });
  await fs.writeFile(configPath, JSON.stringify({ unrelated: { keep: true } }));
  await saveProviders(configPath, vault, {
    work: {
      type: 'openai-codex',
      family: 'openai-codex',
      activeKey: 'a',
      models: ['initial'],
      apiKeys: [
        { label: 'a', apiKey: 'old-access', refreshToken: 'old-refresh', createdAt: '' },
        { label: 'b', apiKey: 'other-access', refreshToken: 'other-refresh', createdAt: '' },
      ],
    },
    personal: { type: 'openai-codex', apiKey: 'personal-secret' },
  });
  installWebuiProviderPersisters({
    mutate: (fn) => mutateSavedProviders(configPath, vault, fn),
    warn,
  });
});
afterEach(async () => {
  hooks.oauth = undefined;
  hooks.models = undefined;
  await fs.rm(dir, { recursive: true, force: true });
});
const settle = () => mutateSavedProviders(configPath, vault, () => {});

it('rotates the original key, preserves active selection and another account, and encrypts tokens', async () => {
  await mutateSavedProviders(configPath, vault, (providers) => {
    providers['work']!.activeKey = 'b';
  });
  hooks.oauth!(
    'work',
    {
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: Date.now() + 60000,
    },
    source,
  );
  await settle();
  const saved = await loadSavedProviders(configPath, vault);
  expect(saved['work']?.activeKey).toBe('b');
  expect(saved['work']?.apiKeys?.[0]?.apiKey).toBe('rotated-access');
  expect(saved['work']?.apiKeys?.[0]?.refreshToken).toBe('rotated-refresh');
  expect(saved['personal']?.apiKey).toBe('personal-secret');
  const raw = await fs.readFile(configPath, 'utf8');
  expect(raw).not.toContain('rotated-access');
  expect(raw).not.toContain('rotated-refresh');
  expect(JSON.parse(raw).unrelated).toEqual({ keep: true });
  hooks.models!('work', [{ id: 'stale-model', name: 'Stale' }], {
    ...source,
    accessToken: 'rotated-access',
    refreshToken: 'rotated-refresh',
  });
  await settle();
  expect((await loadSavedProviders(configPath, vault))['work']?.models).toEqual(['initial']);
  hooks.models!('work', [{ id: 'active-model', name: 'Active' }], {
    label: 'b',
    accessToken: 'other-access',
    refreshToken: 'other-refresh',
  });
  await settle();
  expect((await loadSavedProviders(configPath, vault))['work']?.models).toEqual(['active-model']);
});
it('ignores late rotations after login replacement or account removal', async () => {
  await mutateSavedProviders(configPath, vault, (providers) => {
    providers['work']!.apiKeys![0]!.apiKey = 'fresh-login';
  });
  hooks.oauth!('work', { accessToken: 'late-access', expiresAt: Date.now() + 60000 }, source);
  await settle();
  expect((await loadSavedProviders(configPath, vault))['work']?.apiKeys?.[0]?.apiKey).toBe(
    'fresh-login',
  );
  await mutateSavedProviders(configPath, vault, (providers) => {
    delete providers['work'];
  });
  hooks.oauth!('work', { accessToken: 'late-access', expiresAt: Date.now() + 60000 }, source);
  await settle();
  expect((await loadSavedProviders(configPath, vault))['work']).toBeUndefined();
});
it('warns about persistence failure without logging tokens and recovers the writer queue', async () => {
  await fs.writeFile(configPath, '{broken');
  hooks.oauth!(
    'work',
    { accessToken: 'never-log-this-token', expiresAt: Date.now() + 60000 },
    source,
  );
  await vi.waitFor(() =>
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be saved')),
  );
  expect(warn.mock.calls[0]?.[0]).not.toContain('never-log-this-token');
  await fs.writeFile(
    configPath,
    JSON.stringify({ providers: { work: { type: 'openai-codex', apiKey: 'repaired' } } }),
  );
  hooks.oauth!('work', { accessToken: 'recovered', expiresAt: Date.now() + 60000 });
  await settle();
  expect((await loadSavedProviders(configPath, vault))['work']?.apiKeys?.[0]?.apiKey).toBe(
    'recovered',
  );
});
