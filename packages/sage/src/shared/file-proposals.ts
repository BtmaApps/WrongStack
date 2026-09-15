/**
 * File triage proposals as MemoryCandidates, deduped against pending reviews.
 * Shared by `/memory triage --apply` and the daily dry-run host schedule.
 */

import type { SageSurface } from '../service-contract.js';
import type { TriageProposal } from '../triage/action-dispatcher.js';
import type { CreateCandidateInput } from '../types.js';
import {
  filterProposalsAgainstPendingTargets,
  reviewedTargetTexts,
  wasReviewedUnchanged,
} from './candidate-dedupe.js';

export interface ProposalFileResult {
  filed: number;
  failed: number;
  total: number;
  skippedAsDuplicate: number;
  /** Proposals dropped because a human already reviewed the unchanged memory. */
  skippedAsReviewed: number;
  failures: Array<{ memoryId: string; error: string }>;
  inputs: CreateCandidateInput[];
}

export async function fileTriageProposals(
  Sage: SageSurface,
  proposals: readonly TriageProposal[],
): Promise<ProposalFileResult> {
  const inputs: CreateCandidateInput[] = [];
  const failures: Array<{ memoryId: string; error: string }> = [];
  let filed = 0;
  let skippedAsDuplicate = 0;
  let skippedAsReviewed = 0;

  let toFile = [...proposals];
  if (typeof Sage.listCandidates === 'function') {
    try {
      const candidates = await Sage.listCandidates(true);
      const filtered = filterProposalsAgainstPendingTargets(proposals, candidates);
      skippedAsDuplicate = proposals.length - filtered.length;
      toFile = filtered;
      const reviewed = reviewedTargetTexts(candidates, Date.now());
      if (reviewed.size > 0) {
        const stillOpen: TriageProposal[] = [];
        for (const proposal of toFile) {
          const memory = reviewed.has(proposal.memoryId)
            ? await Sage.getSage(proposal.memoryId)
            : null;
          if (memory && wasReviewedUnchanged(reviewed, memory)) {
            skippedAsReviewed++;
            continue;
          }
          stillOpen.push(proposal);
        }
        toFile = stillOpen;
      }
    } catch {
      // Fail-open: file all proposals.
    }
  }

  for (const proposal of toFile) {
    const input: CreateCandidateInput = {
      text: proposal.memoryText,
      targetMemoryId: proposal.memoryId,
      reviewReason: proposal.reason,
      suggestedAction: proposal.suggestedAction,
      kind: 'memory_review',
      scope: 'project',
      importance: 0.5,
      confidence: 0.9,
      tags: ['triage'],
      anchors: [],
      sources: [{ type: 'project_instruction' }],
    };
    inputs.push(input);
    try {
      await Sage.createCandidate(input);
      filed++;
    } catch (err) {
      failures.push({
        memoryId: proposal.memoryId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    filed,
    failed: failures.length,
    total: toFile.length,
    skippedAsDuplicate,
    skippedAsReviewed,
    failures,
    inputs,
  };
}
