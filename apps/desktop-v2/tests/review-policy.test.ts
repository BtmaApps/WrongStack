import { describe, expect, it } from 'vitest';
import {
  reviewChainPreview,
  reviewModelChange,
  reviewModelReference,
  reviewPolicyIssue,
} from '../src/review-policy-model';

describe('review policy ownership and routing', () => {
  it('preserves provider-qualified model paths and clears the conflicting profile', () => {
    const change = reviewModelChange('autoReview', 'openrouter/vendor/model');
    expect(change).toEqual({
      autoReviewProvider: 'openrouter',
      autoReviewModel: 'vendor/model',
      autoReviewFallbackProfile: '',
    });
    expect(reviewModelReference(change, 'autoReview')).toBe('openrouter/vendor/model');
    expect(reviewModelChange('chimera', '')).toEqual({ chimeraProvider: '', chimeraModel: '' });
    expect(reviewModelChange('chimera', 'model-only')).toEqual({
      chimeraProvider: '',
      chimeraModel: 'model-only',
    });
  });
  it('keeps observed fallback evidence separate from unsaved routing', () => {
    const saved = {
      fallbackProfiles: { daily: ['one/a'] },
      autoReviewFallbackProfile: '',
      autoReviewFallbackModels: ['two/b'],
    };
    expect(reviewChainPreview(saved, saved)).toEqual({
      chain: ['two/b'],
      stale: false,
      missing: false,
    });
    expect(reviewChainPreview(saved, { ...saved, autoReviewFallbackProfile: 'daily' })).toEqual({
      chain: ['two/b'],
      stale: true,
      missing: false,
    });
    expect(
      reviewChainPreview(saved, { ...saved, autoReviewFallbackProfile: 'removed' }).missing,
    ).toBe(true);
  });
  it('validates whole-number budgets and the canonical timer boundary without arbitrary UI caps', () => {
    expect(
      reviewPolicyIssue({
        chimeraMaxFiles: 120,
        autoReviewMaxConcurrentReviews: 20,
        autoReviewDebounceMs: 0,
      }),
    ).toBeNull();
    for (const value of [-1, 1.5, NaN, Infinity, undefined, 2_147_483_648])
      expect(reviewPolicyIssue({ autoReviewDebounceMs: value })).toMatch(/whole number/);
    expect(reviewPolicyIssue({ chimeraMaxFiles: 0 })).toMatch(/Chimera file limit/);
    expect(reviewPolicyIssue({ unrelated: true })).toBeNull();
  });
});
