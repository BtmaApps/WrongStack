import { describe, expect, it } from 'vitest';
import { formatMemoryHints } from '../../src/retrieval/format.js';
import { memoryReviewReason } from '../../src/retrieval/review-freshness.js';
import type { Sage } from '../../src/types.js';

const now = Date.parse('2026-09-28T00:00:00Z');
function memory(patch: Partial<Sage> = {}): Sage {
  return {
    id: 'm',
    revision: 1,
    kind: 'fact',
    scope: 'project',
    status: 'active',
    text: 'Transport uses a dedicated quota.',
    importance: 0.8,
    confidence: 0.8,
    freshness: 1,
    tags: [],
    sources: [],
    anchors: [{ type: 'file', path: 'transport.ts' }],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...patch,
  };
}
describe('advisory review freshness', () => {
  it.each(['useful', 'irrelevant', 'uncertain'] as const)(
    'does not let a later %s judgment hide a current factual challenge',
    (verdict) => {
      const m = memory({
        lastVerifiedAt: new Date(now).toISOString(),
        feedback: [
          {
            verdict: 'incorrect',
            observedRevision: 1,
            evidence: 'Current code contradicts the claim.',
            at: new Date(now - 1000).toISOString(),
          },
          {
            verdict,
            observedRevision: 1,
            evidence: 'Assessment for another task.',
            at: new Date(now).toISOString(),
          },
        ],
      });
      const original = structuredClone(m);
      expect(memoryReviewReason(m, now)).toBe('model_challenged');
      const hints = formatMemoryHints([m]);
      expect(hints).toContain(`modelReview=${verdict}`);
      expect(hints).toContain('modelChallenge=incorrect');
      expect(hints).toContain('historicalHint=check current sources before relying');
      expect(m).toEqual(original);
      const corrected = { ...m, revision: 2 };
      expect(memoryReviewReason(corrected, now)).toBeUndefined();
      expect(formatMemoryHints([corrected])).not.toContain('modelChallenge=');
    },
  );
  it('labels unverified code knowledge as a historical hint without changing it', () => {
    const m = memory();
    const original = structuredClone(m);
    expect(memoryReviewReason(m, now)).toBe('unverified_anchor');
    expect(formatMemoryHints([m])).toContain('historicalHint=check current sources before relying');
    expect(m).toEqual(original);
  });
  it('distinguishes old verification from a recently checked anchor', () => {
    expect(
      memoryReviewReason(memory({ lastVerifiedAt: '2026-09-27T00:00:00Z' }), now),
    ).toBeUndefined();
    expect(memoryReviewReason(memory({ lastVerifiedAt: '2026-08-01T00:00:00Z' }), now)).toBe(
      'verification_old',
    );
  });
  it('does not request code verification for unanchored user preferences or banned records', () => {
    expect(memoryReviewReason(memory({ kind: 'preference', anchors: [] }), now)).toBeUndefined();
    expect(memoryReviewReason(memory({ contextPolicy: 'never' }), now)).toBeUndefined();
    expect(memoryReviewReason(memory({ status: 'deleted' }), now)).toBeUndefined();
  });
  it('uses current-revision challenges, not historical judgments of superseded content', () => {
    const feedback = [
      {
        verdict: 'incorrect' as const,
        observedRevision: 1,
        evidence: 'Current source differs.',
        at: new Date(now).toISOString(),
      },
    ];
    expect(memoryReviewReason(memory({ feedback }), now)).toBe('model_challenged');
    expect(
      memoryReviewReason(
        memory({ revision: 2, feedback, lastVerifiedAt: new Date(now).toISOString() }),
        now,
      ),
    ).toBeUndefined();
    expect(memoryReviewReason(memory({ status: 'stale' }), now)).toBe('stale_anchor');
  });
});
