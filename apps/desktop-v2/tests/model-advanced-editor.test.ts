import { modelsDevModelSchema, normalizeModelsDevModel } from '@wrongstack/core/models';
import { describe, expect, it } from 'vitest';
import { buildModelDefinition, modelEditorDraft } from '../src/model-catalog-editor';

describe('advanced native model authoring', () => {
  const initial = {
    modelsDev: {
      name: 'Reviewed model',
      reasoning_options: { type: 'effort', values: ['low', 'high'], future: 'keep' },
      interleaved: { field: 'reasoning_content', future: 42 },
      provider: { npm: '@ai-sdk/openai-compatible', future: true },
      reasoningConfig: { default: 'adaptive', disableSupported: true, effortLevels: ['high'] },
      cost: { tiers: [{ from: 200000, input: 2 }] },
      status: 'future-status',
    },
  };
  it('round trips untouched structured controls and future metadata exactly', () => {
    const result = buildModelDefinition(modelEditorDraft('reviewed', initial), initial);
    expect(result.definition['modelsDev']).toEqual(initial.modelsDev);
  });
  it('authors schema-valid multiple reasoning controls, replay, lifecycle, wire and cache pricing', () => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.options[0]!.values = ['minimal', 'high', 'max'];
    draft.advanced.runtimePolicy = 'catalog';
    draft.advanced.options.push({
      type: 'budget_tokens',
      values: [],
      min: '1024',
      max: '32768',
      source: {},
    });
    draft.advanced.field = 'reasoning';
    draft.advanced.status = 'beta';
    draft.advanced.experimental = 'false';
    draft.advanced.api = 'https://provider.example/v1';
    draft.numbers['cost.cache_write_1h'] = '0';
    draft.numbers['cost.input_audio'] = '1.25';
    const result = buildModelDefinition(draft, initial);
    const md = result.definition['modelsDev'] as Record<string, unknown>;
    expect(modelsDevModelSchema.safeParse({ id: result.id, ...md }).success).toBe(true);
    expect(md).toMatchObject({
      status: 'beta',
      experimental: false,
      reasoning_options: [
        { type: 'effort', values: ['minimal', 'high', 'max'], future: 'keep' },
        { type: 'budget_tokens', min: 1024, max: 32768 },
      ],
      interleaved: { field: 'reasoning', future: 42 },
      provider: {
        npm: '@ai-sdk/openai-compatible',
        api: 'https://provider.example/v1',
        future: true,
      },
      cost: { cache_write_1h: 0, input_audio: 1.25, tiers: initial.modelsDev.cost.tiers },
    });
    expect(initial.modelsDev.reasoning_options.values).toEqual(['low', 'high']);
    expect(md['reasoningConfig']).toBeUndefined();
  });
  it('explicitly clears controls and wire fields while preserving unedited siblings', () => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.options = [];
    draft.advanced.runtimePolicy = 'catalog';
    draft.advanced.interleaved = 'false';
    draft.advanced.npm = '';
    draft.advanced.status = '';
    const md = buildModelDefinition(draft, initial).definition['modelsDev'] as Record<
      string,
      unknown
    >;
    expect(md['reasoning_options']).toBeUndefined();
    expect(md['interleaved']).toBe(false);
    expect(md['status']).toBeUndefined();
    expect(md['provider']).toEqual({ future: true });
  });
  it.each([
    ['-1', '100'],
    ['1.5', '100'],
    ['100', '20'],
    ['Infinity', '100'],
  ])('rejects invalid token bounds %s / %s', (min, max) => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.runtimePolicy = 'catalog';
    draft.advanced.options = [{ type: 'budget_tokens', values: [], min, max, source: {} }];
    expect(() => buildModelDefinition(draft, initial)).toThrow(/reasoning token/i);
  });
  it.each([
    'file:///tmp/model',
    'javascript:alert(1)',
    'https://user:password@example.com',
    'relative',
  ])('rejects invalid model endpoint %s', (api) => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.api = api;
    expect(() => buildModelDefinition(draft, initial)).toThrow(/HTTP or HTTPS URL/);
  });
  it('rejects duplicate controls, unknown efforts and empty explicit replay fields', () => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.runtimePolicy = 'catalog';
    draft.advanced.options.push({ ...draft.advanced.options[0]! });
    expect(() => buildModelDefinition(draft, initial)).toThrow('at most once');
    draft.advanced.options = [{ ...draft.advanced.options[0]!, values: ['ultra'] }];
    expect(() => buildModelDefinition(draft, initial)).toThrow('effort levels');
    draft.advanced.options = [];
    draft.advanced.field = '';
    expect(() => buildModelDefinition(draft, initial)).toThrow('replay field');
  });
  it('refuses ineffective catalog control edits under an explicit runtime reasoning policy', () => {
    const draft = modelEditorDraft('reviewed', initial);
    draft.advanced.options[0]!.values = ['max'];
    expect(() => buildModelDefinition(draft, initial)).toThrow('takes precedence');
  });
  it('authors an explicit runtime policy, preserves its unknown metadata and restores catalog derivation explicitly', () => {
    const input = {
      modelsDev: {
        ...initial.modelsDev,
        reasoningConfig: { ...initial.modelsDev.reasoningConfig, future: 'keep' },
      },
    };
    const draft = modelEditorDraft('reviewed', input);
    draft.advanced.runtimePolicy = 'custom';
    draft.advanced.runtime = {
      default: 'adaptive',
      disableSupported: true,
      effortSupported: 'true',
      effortLevels: ['high', 'max'],
      preserveThinking: 'optional',
    };
    const md = buildModelDefinition(draft, input).definition['modelsDev'] as Record<
      string,
      unknown
    >;
    expect(md['reasoningConfig']).toEqual({
      ...draft.advanced.runtime,
      effortSupported: true,
      future: 'keep',
    });
    expect(
      normalizeModelsDevModel({ id: 'reviewed', name: 'Reviewed', ...md }).reasoningConfig
        ?.effortLevels,
    ).toEqual(['high', 'max']);
    const restore = modelEditorDraft('reviewed', { modelsDev: md });
    restore.advanced.runtimePolicy = 'catalog';
    const restored = buildModelDefinition(restore, { modelsDev: md }).definition[
      'modelsDev'
    ] as Record<string, unknown>;
    expect(restored['reasoningConfig']).toBeUndefined();
    expect(
      normalizeModelsDevModel({ id: 'reviewed', name: 'Reviewed', ...restored }).reasoningConfig
        ?.effortLevels,
    ).toEqual(['low', 'high']);
  });
  it.each(['empty-levels', 'undocumented-levels', 'always-on-disable', 'invalid-default'])(
    'rejects contradictory explicit runtime policy %s',
    (variant) => {
      const draft = modelEditorDraft('reviewed', initial);
      draft.advanced.runtimePolicy = 'custom';
      draft.advanced.runtime = {
        default: 'enabled',
        disableSupported: true,
        effortSupported: 'true',
        effortLevels: ['high'],
        preserveThinking: 'optional',
      };
      if (variant === 'empty-levels') draft.advanced.runtime.effortLevels = [];
      if (variant === 'undocumented-levels') draft.advanced.runtime.effortSupported = 'inherit';
      if (variant === 'always-on-disable') draft.advanced.runtime.default = 'always_on';
      if (variant === 'invalid-default') draft.advanced.runtime.default = 'invalid';
      expect(() => buildModelDefinition(draft, initial)).toThrow(/runtime|Always-on/);
    },
  );
});
