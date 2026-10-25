import type { MemoryCandidate, Sage } from '../types.js';

/** A consolidation proposal nobody rejected within this window is applied. */
export const CONSOLIDATION_AUTO_ACCEPT_MS = 7 * 86_400_000;

export interface ConsolidationAutoAcceptStore {
  listCandidates(includeResolved?: boolean): Promise<MemoryCandidate[]>;
  acceptCandidate(candidateId: string): Promise<Sage | undefined>;
}

/**
 * Apply pending consolidation proposals older than `windowMs`. The window is
 * the review period: rejecting a proposal inside it keeps the members as they
 * are. Acceptance only supersedes members (reversible) and re-checks each
 * member's revision, so a member edited since distillation is left alone.
 * Runs in the store owner with no model call.
 */
export async function acceptDueConsolidations(
  store: ConsolidationAutoAcceptStore,
  nowMs: number,
  windowMs = CONSOLIDATION_AUTO_ACCEPT_MS,
): Promise<{ accepted: string[]; failed: number }> {
  const accepted: string[] = [];
  let failed = 0;
  for (const candidate of await store.listCandidates(false)) {
    if (candidate.suggestedAction !== 'consolidate') continue;
    const createdAt = Date.parse(candidate.createdAt);
    if (!Number.isFinite(createdAt) || nowMs - createdAt < windowMs) continue;
    try {
      if (await store.acceptCandidate(candidate.id)) accepted.push(candidate.id);
    } catch {
      // A lesson that no longer validates stays pending for a person.
      failed++;
    }
  }
  return { accepted, failed };
}
