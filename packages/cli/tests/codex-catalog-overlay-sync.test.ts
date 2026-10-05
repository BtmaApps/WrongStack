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
const CURATED = Object.keys(overlay['openai-codex'].models);
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

  it('is generated, complete and identical for both account providers', () => {
    // Both endpoints serve the same version-gated catalog; the overlay is the
    // guarantee layer that keeps its models visible where discovery cannot
    // (stale client_version, failed snapshot, older binaries reading main).
    expect(overlay['openai-chatgpt'].models).toEqual(overlay['openai-codex'].models);
    for (const model of Object.values(overlay['openai-codex'].models) as Array<
      Record<string, unknown> & { limit?: { context?: number; output?: number } }
    >) {
      expect(model.limit?.context, String(model.id)).toBeGreaterThan(0);
      expect(model.limit?.output, String(model.id)).toBeGreaterThan(0);
      expect(model.reasoning_options, String(model.id)).toBeDefined();
      expect(model.description, String(model.id)).toBeTruthy();
      // Subscription usage is not billed per token; a retiring model must not
      // outlive its retirement here.
      expect(model.cost, String(model.id)).toBeUndefined();
      expect(model.status, String(model.id)).toBeUndefined();
    }
  });

  it('maps the live catalog with the sync script rules', async () => {
    const { buildChatGPTOverlayModels } = await import(
      // @ts-expect-error -- plain .mjs maintainer script, no declaration file
      '../../../scripts/sync-chatgpt-overlay.mjs'
    );
    const models = buildChatGPTOverlayModels(
      [
        {
          slug: 'new-model',
          display_name: 'New',
          description: 'd',
          context_window: 272000,
          max_context_window: 872000,
          input_modalities: ['text'],
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'max' }, { effort: 'ultra' }],
          visibility: 'list',
          upgrade: null,
        },
        { slug: 'retiring', max_context_window: 272000, upgrade: { model: 'new-model' } },
        { slug: 'internal', max_context_window: 272000, visibility: 'hide' },
      ],
      {
        'new-model': {
          id: 'new-model',
          name: 'New',
          knowledge: '2026-01-01',
          cost: { input: 5 },
          limit: { context: 1_050_000, output: 128000 },
        },
      },
    );
    expect(Object.keys(models)).toEqual(['new-model']);
    expect(models['new-model']).toEqual({
      id: 'new-model',
      name: 'New',
      description: 'd',
      knowledge: '2026-01-01',
      reasoning: true,
      reasoning_options: [{ type: 'effort', values: ['low', 'max'] }],
      tool_call: true,
      modalities: { input: ['text'], output: ['text'] },
      // The account's window, the API catalog's output; never its price or window.
      limit: { context: 872000, output: 128000 },
    });
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
      expect(catalog?.models.map((model) => model.id)).toEqual([...CURATED, 'future-rollout']);
      expect(
        resolveProviderModelList(['future-rollout'], catalog, id, undefined, true).map(
          (model) => model.id,
        ),
      ).toEqual(['future-rollout', ...CURATED]);
      expect(
        resolveProviderModelList(['stale-saved'], catalog, id, undefined, true).map(
          (model) => model.id,
        ),
      ).toEqual(['stale-saved', ...CURATED, 'future-rollout']);
      expect((await registry.getModel(id, 'gpt-6.1-sol'))?.provenance?.primary).toBe(
        'wrongstack-overlay',
      );
      registry.mergeOverlay(
        { [id]: { id, name: id, models: {} } },
        { authoritativeProviderIds: [id] },
      );
      await registry.refresh();
      catalog = await registry.getProvider(id);
      expect(catalog?.models.map((model) => model.id)).toEqual(CURATED);
      expect(
        resolveProviderModelList([], catalog, id, undefined, true).map((model) => model.id),
      ).toEqual(CURATED);
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
