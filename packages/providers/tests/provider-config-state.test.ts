import { describe, expect, it } from 'vitest';
import { removeProviderFallbackReferences } from '../src/provider-config-state.js';

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
