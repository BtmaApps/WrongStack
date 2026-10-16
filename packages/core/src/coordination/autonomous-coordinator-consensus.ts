import type { CoordinatorEvent } from './autonomous-coordinator-types.js';
import type { ChangeManager } from './change-manager.js';
import type { ConsensusProtocol } from './consensus-protocol.js';
import type { QualityCheck } from './knowledge-graph.js';

/** A change awaiting consensus, with the quality-gate verdict it carries. */
export interface PendingChangeGate {
  id: string;
  qualityGate: { passed: boolean; checks: QualityCheck[] };
}

export interface PendingChangeVoteHost {
  consensus: ConsensusProtocol;
  changes: ChangeManager;
  selfAgentId: string;
  emit(event: CoordinatorEvent): void;
}

/**
 * Cast the coordinator's own vote on a pending change from its quality gate:
 * approve (and apply once approved) when it passed, reject when it failed.
 */
export async function voteOnPendingChange(
  host: PendingChangeVoteHost,
  change: PendingChangeGate,
): Promise<void> {
  const result = host.consensus.getStatus(change.id);
  if (result?.outcome !== 'pending') return;

  if (change.qualityGate.passed) {
    const voteResult = await host.consensus.castVote(
      change.id,
      host.selfAgentId,
      'approve',
      `Quality gate passed: ${change.qualityGate.checks.map((c) => c.name).join(', ')}`,
    );
    if (voteResult.outcome === 'approved') {
      await host.changes.markApplied(change.id, new Date().toISOString());
      host.emit({
        type: 'consensus:reached',
        goalId: change.id,
        text: 'Change approved and applied',
      });
    }
  } else {
    const voteResult = await host.consensus.castVote(
      change.id,
      host.selfAgentId,
      'reject',
      `Quality gate failed: ${change.qualityGate.checks.map((c) => `${c.name}=${c.passed}`).join(', ')}`,
    );
    if (voteResult.outcome === 'rejected' || voteResult.outcome === 'vetoed') {
      host.emit({
        type: 'consensus:reached',
        goalId: change.id,
        text: 'Change rejected by quality gate',
      });
    }
  }
}
