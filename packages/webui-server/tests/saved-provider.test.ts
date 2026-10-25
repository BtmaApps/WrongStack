import type { Config } from '@wrongstack/contracts/types';
import type { ProviderRegistry } from '@wrongstack/core/registry';
import { describe, expect, it, vi } from 'vitest';
import { buildSavedProvider } from '../src/server/saved-provider.js';

/**
 * The legacy top-level `apiKey`/`baseUrl` belong to the primary provider only
 * (WS-2026-09-26-01). The Brain engine and SAGE consolidation both build
 * non-session providers through this helper, so the rule is pinned here.
 */
function registry() {
  const create = vi.fn((cfg: Record<string, unknown>, factory: string) => ({ cfg, factory }));
  return { create, registry: { create } as unknown as ProviderRegistry };
}

const config = {
  provider: 'anthropic',
  apiKey: 'sk-primary',
  baseUrl: 'https://primary.example',
  providers: {
    anthropic: {},
    openai: { model: 'gpt' },
    work: { type: 'anthropic' },
    moved: { envVars: [] },
  },
} as unknown as Config;

describe('buildSavedProvider', () => {
  it('gives the primary the top-level key and base URL', () => {
    const { create, registry: r } = registry();
    buildSavedProvider(r, config, 'anthropic');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-primary', baseUrl: 'https://primary.example' }),
      'anthropic',
    );
  });

  it('never hands the primary key to another provider, an alias, or a repointed one', () => {
    const { create, registry: r } = registry();
    buildSavedProvider(r, config, 'openai');
    buildSavedProvider(r, config, 'work');
    buildSavedProvider(r, { ...config, provider: 'moved' } as Config, 'moved');
    for (const [cfg] of create.mock.calls) expect(cfg.apiKey).toBeUndefined();
    // An alias is built by its saved factory type, named by its own id.
    expect(create.mock.calls[1]).toEqual([expect.objectContaining({ type: 'work' }), 'anthropic']);
  });
});
