import { describe, expect, it } from 'vitest';
import { reasoningEffortVocabulary } from '../src/picker-effort.js';

/**
 * The settings field-24 gate vocabulary (`getActiveModelReasoningEffortLevels`
 * delegates here). Tri-state contract: `undefined` = undocumented reasoner →
 * the cycle keeps the full canonical set; `[]` = documented
 * `effortSupported === false` → the cycle must go inert (the resolver drops
 * any effort); otherwise the documented levels. Mirrors
 * `startupEffortOptions` in the same module.
 */
describe('reasoningEffortVocabulary', () => {
  it('returns [] for a documented no-effort-control model (tri-state false)', () => {
    expect(reasoningEffortVocabulary({ effortSupported: false, effortLevels: [] })).toEqual([]);
  });

  it('returns the documented levels for a documented vocabulary', () => {
    expect(
      reasoningEffortVocabulary({ effortSupported: true, effortLevels: ['low', 'high'] }),
    ).toEqual(['low', 'high']);
  });

  it('returns undefined for an undocumented reasoner (full canonical set downstream)', () => {
    expect(reasoningEffortVocabulary(undefined)).toBeUndefined();
    expect(reasoningEffortVocabulary({ effortSupported: undefined })).toBeUndefined();
    expect(reasoningEffortVocabulary({ effortSupported: true, effortLevels: [] })).toBeUndefined();
  });
});
