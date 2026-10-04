import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CODEX_MODELS,
  DefaultModelsRegistry,
  resolveProviderModelList,
} from '@wrongstack/core/models';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const overlay = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/providers.json', import.meta.url)), 'utf8'),
);
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chatgpt-catalog-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ChatGPT curated catalog and account discovery', () => {
  it('keeps the refreshable overlay as the only bundled model source', () => {
    expect(CODEX_MODELS).toEqual([]);
    for (const id of ['openai-codex', 'openai-chatgpt']) {
      expect(overlay[id]?.models['gpt-6.1-sol']).toMatchObject({ id: 'gpt-6.1-sol' });
    }
  });

  it.each(['openai-codex', 'openai-chatgpt'])(
    'preserves curated %s suggestions through live, empty and refreshed account snapshots',
    async (id) => {
      const registry = new DefaultModelsRegistry({
        cacheFile: join(dir, 'cache.json'),
        overlay,
        fetchImpl: async () =>
          Response.json({
            [id]: {
              id,
              name: id,
              models: { 'generic-only': { id: 'generic-only', name: 'Generic only' } },
            },
          }),
      });
      await registry.load();
      registry.mergeOverlay(
        {
          [id]: {
            id,
            name: id,
            models: { 'future-rollout': { id: 'future-rollout', name: 'Future rollout' } },
          },
        },
        { authoritativeProviderIds: [id] },
      );
      let catalog = await registry.getProvider(id);
      expect(catalog?.models.map((model) => model.id)).toEqual(['gpt-6.1-sol', 'future-rollout']);
      expect(
        resolveProviderModelList(['future-rollout'], catalog, id, undefined, true).map(
          (model) => model.id,
        ),
      ).toEqual(['future-rollout', 'gpt-6.1-sol']);
      expect(
        resolveProviderModelList(['stale-saved'], catalog, id, undefined, true).map(
          (model) => model.id,
        ),
      ).toEqual(['stale-saved', 'gpt-6.1-sol', 'future-rollout']);
      expect((await registry.getModel(id, 'gpt-6.1-sol'))?.provenance?.primary).toBe(
        'wrongstack-overlay',
      );
      registry.mergeOverlay(
        { [id]: { id, name: id, models: {} } },
        { authoritativeProviderIds: [id] },
      );
      await registry.refresh();
      catalog = await registry.getProvider(id);
      expect(catalog?.models.map((model) => model.id)).toEqual(['gpt-6.1-sol']);
      expect(
        resolveProviderModelList([], catalog, id, undefined, true).map((model) => model.id),
      ).toEqual(['gpt-6.1-sol']);
    },
  );

  it('keeps generic and sibling catalogs out of account membership', () => {
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
    const models = resolveProviderModelList(['account-new'], catalog, 'openai-codex', catalog);
    expect(models.map((model) => model.id)).toEqual(['account-new']);
    expect(models[0]).toMatchObject({ name: 'New account model', contextWindow: 987000 });
    expect(resolveProviderModelList([], catalog, 'openai-codex')).toEqual([]);
  });
});
