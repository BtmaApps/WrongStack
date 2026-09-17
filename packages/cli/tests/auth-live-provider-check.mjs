import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DefaultSecretVault } from '@wrongstack/core/security';
import { wstackGlobalRoot } from '@wrongstack/core/utils';
import { makeProviderFromConfig, setOAuthTokenPersister } from '../../providers/src/index.ts';
import {
  loadConfigProviders,
  mutateConfigProviders,
  normalizeKeys,
} from '../src/provider-config-utils.ts';
import { applyProviderOAuthRefresh } from '../src/wiring/provider-persisters.ts';

const root = wstackGlobalRoot();
const bootstrap = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const selected = bootstrap.activeProfile ?? 'default';
assert.ok(/^[a-zA-Z0-9_-]+$/.test(selected), 'Invalid config profile name');
const configPath = path.join(root, 'profiles', selected, 'config.json');
const vault = new DefaultSecretVault({ keyFile: path.join(root, '.key') });
const providers = await loadConfigProviders(configPath, vault);
let writes = Promise.resolve();
let rotations = 0;
let lastRotation;
setOAuthTokenPersister((id, tokens, source) => {
  writes = writes.then(() =>
    mutateConfigProviders(configPath, vault, (current) => {
      assert.ok(
        current[id] && applyProviderOAuthRefresh(current[id], tokens, source),
        'Source credential changed during refresh',
      );
      rotations++;
      lastRotation = { id, tokens, source };
    }),
  );
});
const observations = [];
try {
  for (const [id, config] of Object.entries(providers)) {
    if (!['openrouter', 'openai-codex'].includes(config.type)) continue;
    const keys = normalizeKeys(config);
    const entry = keys.find((key) => key.label === config.activeKey) ?? keys[0];
    if (!entry) continue;
    const encryptedConfig = await fs.readFile(configPath, 'utf8');
    assert.ok(!encryptedConfig.includes(entry.apiKey), 'Stored access token is not encrypted');
    if (entry.refreshToken)
      assert.ok(
        !encryptedConfig.includes(entry.refreshToken),
        'Stored refresh token is not encrypted',
      );
    if (config.type === 'openrouter') {
      const base = new URL(config.baseUrl ?? 'https://openrouter.ai/api/v1');
      if (base.origin !== 'https://openrouter.ai') {
        observations.push({ type: config.type, result: 'nonofficial-endpoint-skipped' });
        continue;
      }
      const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { authorization: `Bearer ${entry.apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      observations.push({ type: config.type, check: 'saved-credential', status: response.status });
      assert.equal(response.status, 200, 'Saved OpenRouter credential was not accepted');
      const invalid = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { authorization: 'Bearer fixture-invalid-auth-audit-key' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      observations.push({ type: config.type, check: 'invalid-credential', status: invalid.status });
      assert.equal(invalid.status, 401);
    } else {
      const base = new URL(config.baseUrl ?? 'https://chatgpt.com/backend-api/codex');
      if (base.origin !== 'https://chatgpt.com') {
        observations.push({ type: config.type, result: 'nonofficial-endpoint-skipped' });
        continue;
      }
      let catalogStatus;
      const nativeFetch = globalThis.fetch;
      const observeFetch = async (...args) => {
        const response = await nativeFetch(...args);
        if (String(args[0]).includes('/models')) catalogStatus = response.status;
        return response;
      };
      globalThis.fetch = observeFetch;
      try {
        const runtimeConfig = structuredClone(config);
        const refreshKey =
          runtimeConfig.apiKeys?.find((key) => key.label === runtimeConfig.activeKey) ??
          runtimeConfig.apiKeys?.[0];
        const forceRefresh = process.argv.includes('--refresh') && !!refreshKey?.refreshToken;
        if (forceRefresh) refreshKey.expiresAt = new Date(0).toISOString();
        const provider = makeProviderFromConfig(id, runtimeConfig);
        const result = await provider.refreshContextLimit(config.models?.[0] ?? 'gpt-5.4', {
          signal: AbortSignal.timeout(20000),
        });
        await writes;
        if (lastRotation?.id === id) {
          const persisted = normalizeKeys((await loadConfigProviders(configPath, vault))[id]);
          assert.ok(
            persisted.some(
              (key) =>
                key.apiKey === lastRotation.tokens.accessToken &&
                key.refreshToken ===
                  (lastRotation.tokens.refreshToken ?? lastRotation.source?.refreshToken),
            ),
            'Rotated credential did not survive reload',
          );
          const raw = await fs.readFile(configPath, 'utf8');
          assert.ok(
            !raw.includes(lastRotation.tokens.accessToken),
            'Access token is not encrypted',
          );
          if (lastRotation.tokens.refreshToken)
            assert.ok(
              !raw.includes(lastRotation.tokens.refreshToken),
              'Refresh token is not encrypted',
            );
        }
        observations.push({
          type: config.type,
          check: 'saved-credential-catalog',
          status: catalogStatus,
          contextResolved: !!result,
          rotations,
          forceRefresh,
        });
        assert.equal(catalogStatus, 200, 'Saved Codex credential was not accepted');
        catalogStatus = undefined;
        const invalidProvider = makeProviderFromConfig('auth-audit-invalid-fixture', {
          type: 'openai-codex',
          family: 'openai-codex',
          envVars: [],
          activeKey: 'fixture',
          apiKeys: [
            {
              label: 'fixture',
              apiKey: 'fixture-invalid-codex-token',
              createdAt: '',
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        });
        const invalidResult = await invalidProvider.refreshContextLimit('gpt-5.4', {
          signal: AbortSignal.timeout(20000),
        });
        observations.push({
          type: config.type,
          check: 'invalid-credential-catalog',
          status: catalogStatus,
          contextResolved: !!invalidResult,
        });
        assert.ok([401, 403].includes(catalogStatus), 'Invalid Codex credential was not rejected');
        assert.ok(!invalidResult, 'Invalid credential unexpectedly resolved model context');
      } finally {
        globalThis.fetch = nativeFetch;
      }
    }
  }
  assert.ok(observations.length > 0, 'No supported configured OAuth accounts');
  console.log(JSON.stringify({ checks: observations, tokenRotationsPersisted: rotations }));
} catch (error) {
  await writes;
  console.log(
    JSON.stringify({
      checks: observations,
      tokenRotationsPersisted: rotations,
      failed: true,
      errorCode: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  setOAuthTokenPersister(undefined);
}
