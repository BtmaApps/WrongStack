import { modelsDevModelSchema } from '@wrongstack/core/models';
import { describe, expect, it } from 'vitest';
import { buildModelDefinition, modelEditorDraft } from '../src/model-catalog-editor';
import { priceTierDraft } from '../src/model-price-tiers';

const initial = {
  modelsDev: {
    name: 'Tier fixture',
    cost: {
      input: 1,
      context_over_200k: { input: 2, output: 4, future: true },
      tiers: [
        {
          tier: { type: 'context', size: 200000, future: 'keep' },
          input: 2,
          output: 4,
          future: 42,
        },
      ],
    },
  },
};
const saved = (draft: ReturnType<typeof modelEditorDraft>, source = initial) =>
  buildModelDefinition(draft, source).definition['modelsDev'] as Record<string, unknown>;
describe('native context price tiers', () => {
  it('preserves actual nested upstream rates and tiers on an unrelated edit', () => {
    const draft = modelEditorDraft('tier-fixture', initial);
    draft.text['description'] = 'Reviewed';
    expect(saved(draft)['cost']).toEqual(initial.modelsDev.cost);
    expect(modelsDevModelSchema.safeParse({ id: 'tier-fixture', ...saved(draft) }).success).toBe(
      true,
    );
  });
  it('authors canonical tiers with zero rates, omitted blanks and retained unknown metadata', () => {
    const draft = modelEditorDraft('tier-fixture', initial);
    draft.pricing.changed = true;
    draft.pricing.rows[0]!.prices['input'] = '0';
    draft.pricing.rows[0]!.prices['output'] = '';
    const next = priceTierDraft();
    next.size = '400000';
    next.prices['input'] = '5.25';
    draft.pricing.rows.push(next);
    expect(saved(draft)['cost']).toEqual({
      ...initial.modelsDev.cost,
      tiers: [
        { tier: { type: 'context', size: 200000, future: 'keep' }, input: 0, future: 42 },
        { tier: { type: 'context', size: 400000 }, input: 5.25 },
      ],
    });
    expect(initial.modelsDev.cost.tiers[0]!.input).toBe(2);
  });
  it('removes only the explicitly reviewed tier schedule and keeps base and legacy rates', () => {
    const draft = modelEditorDraft('tier-fixture', initial);
    draft.pricing = { changed: true, unsupported: false, rows: [] };
    const { tiers: _tiers, ...other } = initial.modelsDev.cost;
    expect(saved(draft)['cost']).toEqual(other);
  });
  it.each(['', '0', '-1', '1.5', 'Infinity', '9007199254740992'])(
    'rejects invalid context threshold %s',
    (size) => {
      const draft = modelEditorDraft('tier-fixture', initial);
      draft.pricing.changed = true;
      draft.pricing.rows[0]!.size = size;
      expect(() => saved(draft)).toThrow(/whole context threshold/);
    },
  );
  it.each(['-1', 'Infinity', 'NaN'])('rejects invalid rates %s', (rate) => {
    const draft = modelEditorDraft('tier-fixture', initial);
    draft.pricing.changed = true;
    draft.pricing.rows[0]!.prices['cache_read'] = rate;
    expect(() => saved(draft)).toThrow(/non-negative/);
  });
  it('rejects duplicate thresholds and price-less new rows', () => {
    const draft = modelEditorDraft('tier-fixture', initial);
    draft.pricing.changed = true;
    draft.pricing.rows.push({ ...priceTierDraft(), size: '200000', prices: { input: '2' } });
    expect(() => saved(draft)).toThrow(/unique/);
    draft.pricing.rows[1]!.size = '300000';
    draft.pricing.rows[1]!.prices = {};
    expect(() => saved(draft)).toThrow(/at least one price/);
  });
  it('retains opaque rows and unsupported root formats without inventing their meaning', () => {
    const source = { modelsDev: { name: 'Future fixture', cost: { tiers: [{ future: true }] } } };
    const draft = modelEditorDraft('future', source);
    expect(draft.pricing.rows[0]?.editable).toBe(false);
    draft.pricing.changed = true;
    expect(buildModelDefinition(draft, source).definition).toMatchObject(source);
    const future = { modelsDev: { name: 'Future fixture', cost: { tiers: { future: true } } } };
    const preserved = modelEditorDraft('future', future);
    expect(buildModelDefinition(preserved, future).definition).toMatchObject(future);
    preserved.pricing.changed = true;
    expect(() => buildModelDefinition(preserved, future)).toThrow(/unsupported saved tier format/);
  });
});
