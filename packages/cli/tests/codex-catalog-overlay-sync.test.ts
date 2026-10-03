import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CODEX_MODELS, resolveProviderModelList } from '@wrongstack/core/models';
import { describe, expect, it } from 'vitest';

const overlay = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/providers.json', import.meta.url)), 'utf8'),
);
describe('Codex account catalog ownership', () => {
  it('retains the provider definition without bundling model IDs or a core floor', () => {
    expect(overlay['openai-codex']).toBeDefined();
    expect(overlay['openai-codex'].models).toEqual({});
    expect(CODEX_MODELS).toEqual([]);
  });
  it('keeps newly released account IDs while generic metadata cannot expand membership', () => {
    const catalog = {
      id: 'openai-codex',
      name: 'Codex',
      family: 'openai-codex' as const,
      envVars: [],
      models: [
        { id: 'account-new', name: 'New account model', limit: { context: 987000 } },
        { id: 'generic-only', name: 'Generic only' },
      ],
    };
    const models = resolveProviderModelList(['account-new'], catalog, 'openai-codex');
    expect(models.map((model) => model.id)).toEqual(['account-new']);
    expect(models[0]).toMatchObject({ name: 'New account model', contextWindow: 987000 });
    expect(resolveProviderModelList([], catalog, 'openai-codex')).toEqual([]);
  });
});
