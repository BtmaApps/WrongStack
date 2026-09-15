import { describe, expect, it } from 'vitest';
import {
  filterProposalsAgainstPendingTargets,
  REVIEW_SUPPRESSION_MS,
  reviewedTargetTexts,
  wasReviewedUnchanged,
} from '../../src/shared/candidate-dedupe.js';

describe('review suppression', () => {
  const now = Date.parse('2026-09-15T00:00:00.000Z');
  const recent = new Date(now - 86_400_000).toISOString();

  it('remembers resolved review texts per target and ignores pending or foreign candidates', () => {
    const reviewed = reviewedTargetTexts(
      [
        {
          status: 'rejected',
          kind: 'memory_review',
          targetMemoryId: 'm1',
          text: 'Kept  fact',
          updatedAt: recent,
        },
        {
          status: 'pending',
          kind: 'memory_review',
          targetMemoryId: 'm2',
          text: 'Pending',
          updatedAt: recent,
        },
        {
          status: 'accepted',
          kind: 'fact',
          targetMemoryId: 'm3',
          text: 'Plain',
          updatedAt: recent,
        },
        {
          status: 'rejected',
          kind: 'memory_review',
          targetMemoryId: 'm4',
          text: 'Too old',
          updatedAt: new Date(now - REVIEW_SUPPRESSION_MS - 1).toISOString(),
        },
      ],
      now,
    );

    expect([...reviewed.keys()]).toEqual(['m1']);
    expect(wasReviewedUnchanged(reviewed, { id: 'm1', text: 'Kept fact' })).toBe(true);
    expect(wasReviewedUnchanged(reviewed, { id: 'm1', text: 'Kept fact, now rewritten' })).toBe(
      true,
    );
    expect(wasReviewedUnchanged(reviewed, { id: 'm1', text: 'Different fact' })).toBe(false);
    expect(wasReviewedUnchanged(reviewed, { id: 'm2', text: 'Pending' })).toBe(false);
  });
});

describe('filterProposalsAgainstPendingTargets', () => {
  it('drops proposals that already have a pending targetMemoryId', () => {
    const proposals = [
      { memoryId: 'a', reason: 'x' },
      { memoryId: 'b', reason: 'y' },
      { memoryId: 'c', reason: 'z' },
    ];
    const pending = [
      { status: 'pending', targetMemoryId: 'b' },
      { status: 'accepted', targetMemoryId: 'c' },
      { status: 'pending' },
    ];
    expect(filterProposalsAgainstPendingTargets(proposals, pending)).toEqual([
      { memoryId: 'a', reason: 'x' },
      { memoryId: 'c', reason: 'z' },
    ]);
  });

  it('returns all proposals when nothing is pending', () => {
    const proposals = [{ memoryId: 'a' }];
    expect(filterProposalsAgainstPendingTargets(proposals, [])).toEqual(proposals);
  });
});
