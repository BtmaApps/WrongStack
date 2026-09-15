/**
 * Dedupe triage proposals against already-pending hygiene/review candidates
 * so the same memory is not proposed twice for human review.
 */

import { normalizeText } from '../store-helpers.js';

/**
 * How long a human review decision suppresses re-proposing the same, unchanged
 * memory. Long enough that "keep" means something; bounded so a memory kept
 * once can still resurface if it goes on being unused for months.
 */
export const REVIEW_SUPPRESSION_MS = 90 * 86_400_000;

export interface ReviewedCandidate {
  status: string;
  kind?: string | undefined;
  targetMemoryId?: string | undefined;
  text: string;
  updatedAt: string;
}

/**
 * Texts a human already reviewed, per target memory, within the suppression
 * window. Only resolved `memory_review` candidates count: a pending one is
 * handled by the pending-target filter, and a proposal that deleted or
 * archived its target leaves nothing active to re-propose.
 *
 * Hygiene and triage used to dedupe against PENDING candidates only, so a
 * rejected or kept proposal was filed again on the next run for a memory that
 * had not changed at all — the review queue re-asked the same question until
 * someone gave the destructive answer.
 */
export function reviewedTargetTexts(
  candidates: readonly ReviewedCandidate[],
  nowMs: number,
): Map<string, string[]> {
  const reviewed = new Map<string, string[]>();
  for (const c of candidates) {
    if (c.status === 'pending' || c.kind !== 'memory_review' || !c.targetMemoryId) continue;
    const at = Date.parse(c.updatedAt);
    if (!Number.isFinite(at) || nowMs - at > REVIEW_SUPPRESSION_MS) continue;
    const text = normalizeText(c.text);
    if (!text) continue;
    const texts = reviewed.get(c.targetMemoryId) ?? [];
    texts.push(text);
    reviewed.set(c.targetMemoryId, texts);
  }
  return reviewed;
}

/**
 * True when the memory still carries the content a human reviewed. Matching is
 * on content, not `updatedAt`: verification and counters move timestamps on a
 * memory nobody edited. Triage files an 80-char preview, hence the prefix test.
 */
export function wasReviewedUnchanged(
  reviewed: ReadonlyMap<string, readonly string[]>,
  memory: { id: string; text: string },
): boolean {
  const texts = reviewed.get(memory.id);
  if (!texts) return false;
  const current = normalizeText(memory.text);
  return texts.some((text) => current.startsWith(text));
}

export interface PendingCandidateTarget {
  status: string;
  targetMemoryId?: string | undefined;
}

/**
 * Drop proposals whose `memoryId` already has a pending candidate
 * with a matching `targetMemoryId`.
 */
export function filterProposalsAgainstPendingTargets<T extends { memoryId: string }>(
  proposals: readonly T[],
  pending: readonly PendingCandidateTarget[],
): T[] {
  const pendingTargets = new Set(
    pending
      .filter(
        (c) => c.status === 'pending' && typeof c.targetMemoryId === 'string' && c.targetMemoryId,
      )
      .map((c) => c.targetMemoryId as string),
  );
  const seen = new Set<string>();
  const result: T[] = [];
  for (const p of proposals) {
    if (!pendingTargets.has(p.memoryId) && !seen.has(p.memoryId)) {
      seen.add(p.memoryId);
      result.push(p);
    }
  }
  return result;
}
