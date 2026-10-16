import { describe, expect, it } from 'vitest';
import {
  authProfileAliasError,
  isReservedProviderId,
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
