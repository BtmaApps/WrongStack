import { describe, expect, it } from 'vitest';
import {
  authProfileAliasError,
  clearStaleProviderDefaults,
  isReservedProviderId,
  ProviderConfigSnapshots,
  removeProviderFallbackReferences,
} from '../src/provider-config-state.js';

/**
 * `removeProviderFallbackReferences` scrubs a deleted provider from fallback
 * routing. `disabledProviders` holds bare provider ids (not model refs), so it
 * needs its own cleanup — otherwise deleting a parked provider leaves a
 * dangling entry that would silently park a FUTURE provider with the same id.
 */
describe('removeProviderFallbackReferences — disabledProviders cleanup', () => {
  it('drops the removed provider id, matching case-insensitively', () => {
    const config: Record<string, unknown> = {
      providers: {},
      disabledProviders: ['OpenAI', 'anthropic'],
    };
    removeProviderFallbackReferences(config, 'openai');
    expect(config['disabledProviders']).toEqual(['anthropic']);
  });

  it('keeps other providers and tolerates a missing list', () => {
    const config: Record<string, unknown> = { disabledProviders: ['anthropic'] };
    removeProviderFallbackReferences(config, 'openai');
    expect(config['disabledProviders']).toEqual(['anthropic']);

    const bare: Record<string, unknown> = {};
    expect(() => removeProviderFallbackReferences(bare, 'openai')).not.toThrow();
    expect(bare['disabledProviders']).toBeUndefined();
  });
});

describe('authProfileAliasError — reserved system provider ids', () => {
  it('rejects acp and wrongforge in any case', () => {
    for (const id of ['acp', 'wrongforge', 'ACP', 'WrongForge']) {
      expect(isReservedProviderId(id)).toBe(true);
      expect(authProfileAliasError(id)).toMatch(/reserved system provider/);
    }
  });

  it('still accepts names that merely contain a reserved word', () => {
    for (const id of ['acp-proxy', 'my-wrongforge', 'openai']) {
      expect(authProfileAliasError(id)).toBeUndefined();
    }
  });
});

describe('clearStaleProviderDefaults & ProviderConfigSnapshots (F41)', () => {
  it('clears defaults when saved apiKey or apiKeys[] entry is blank or baseUrl is a proxied remote host', () => {
    const blankKeysConfig: Record<string, unknown> = {
      provider: 'openai',
      model: 'gpt-5',
      providers: {
        openai: {
          activeKey: 'default',
          apiKeys: [{ label: 'default', apiKey: '   ', createdAt: '' }],
        },
      },
    };
    clearStaleProviderDefaults(blankKeysConfig);
    expect(blankKeysConfig['provider']).toBeUndefined();

    const proxiedRemoteConfig: Record<string, unknown> = {
      provider: 'remote-via-proxy',
      model: 'gpt-5',
      providers: {
        'remote-via-proxy': {
          baseUrl: 'http://localhost:3444/proxy/api.openai.com/v1',
          envVars: [],
        },
      },
    };
    clearStaleProviderDefaults(proxiedRemoteConfig);
    expect(proxiedRemoteConfig['provider']).toBeUndefined();

    const rfcLocalhostConfig: Record<string, unknown> = {
      provider: 'ollama',
      model: 'llama3',
      providers: {
        ollama: {
          baseUrl: 'http://ollama.localhost:11434/v1',
          envVars: [],
        },
      },
    };
    clearStaleProviderDefaults(rfcLocalhostConfig);
    expect(rfcLocalhostConfig['provider']).toBe('ollama');
  });

  it('merges snapshots without false conflicts when object keys are in a different order', () => {
    const snapshots = new ProviderConfigSnapshots();
    const editable = snapshots.track({
      openai: { apiKey: 'sk-1', baseUrl: 'https://api.openai.com/v1' },
    });
    editable.openai = { apiKey: 'sk-2', baseUrl: 'https://api.openai.com/v1' };
    const merged = snapshots.merge(
      { openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-1' } },
      editable,
    );
    expect(merged.openai?.apiKey).toBe('sk-2');
  });
});
