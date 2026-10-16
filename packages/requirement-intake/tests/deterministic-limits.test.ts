/**
 * `deterministicSummary` and `deterministicTitle` collapse non-finite length
 * limits to an empty derivation instead of slicing with NaN.
 */
import { describe, expect, it } from 'vitest';
import { deterministicSummary, deterministicTitle } from '../src/validation.js';

describe('deterministic derivations with non-finite limits', () => {
  it('returns an empty summary for a non-finite limit', () => {
    expect(deterministicSummary('any request text', Number.NaN)).toBe('');
  });

  it('returns an empty title for a non-finite limit', () => {
    expect(deterministicTitle('any request text', Number.NaN)).toBe('');
  });
});
