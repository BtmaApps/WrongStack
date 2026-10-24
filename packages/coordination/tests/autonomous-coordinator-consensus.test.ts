import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PendingChangeVoteHost,
  voteOnPendingChange,
} from '../src/autonomous-coordinator-consensus.js';
import type { CoordinatorEvent } from '../src/autonomous-coordinator-types.js';
import { ChangeManager } from '../src/change-manager.js';
import { ConsensusProtocol } from '../src/consensus-protocol.js';
import { type ChangeNode, KnowledgeGraph } from '../src/knowledge-graph.js';

let dir: string;
let graph: KnowledgeGraph;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'coordinator-vote-'));
  graph = new KnowledgeGraph(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('coordinator quality-gate voting', () => {
  it.each([
    [true, 'approved', 'Change approved and applied'],
    [true, 'pending', undefined],
    [false, 'rejected', 'Change rejected by quality gate'],
    [false, 'vetoed', 'Change rejected by quality gate'],
    [false, 'pending', undefined],
  ] as const)(
    'votes from the gate verdict and announces only a resolution: %s / %s',
    async (passed, outcome, text) => {
      const castVote = vi.fn(async () => ({ outcome }));
      const markApplied = vi.fn(async () => null);
      const emit = vi.fn();
      const host = {
        consensus: { getStatus: () => ({ outcome: 'pending' }), castVote },
        changes: { markApplied },
        selfAgentId: 'leader',
        emit,
      } as unknown as PendingChangeVoteHost;
      await voteOnPendingChange(host, {
        id: 'change',
        qualityGate: { passed, checks: [{ name: 'tests', passed }] },
      });
      expect(castVote).toHaveBeenCalledWith(
        'change',
        'leader',
        passed ? 'approve' : 'reject',
        passed ? 'Quality gate passed: tests' : 'Quality gate failed: tests=false',
      );
      if (passed && outcome === 'approved') {
        expect(markApplied).toHaveBeenCalledWith('change', expect.any(String));
      } else {
        expect(markApplied).not.toHaveBeenCalled();
      }
      if (text)
        expect(emit).toHaveBeenCalledWith({ type: 'consensus:reached', goalId: 'change', text });
      else expect(emit).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'leaves changes awaiting quorum untouched regardless of the quality gate: %s',
    async (passed) => {
      const consensus = new ConsensusProtocol({
        graph,
        voters: [{ agentId: 'leader', agentName: 'Leader', role: 'reviewer', weight: 1 }],
      });
      const changes = new ChangeManager({ graph, consensus });
      const qualityGate = { passed, checks: [{ name: 'tests', passed }] };
      const proposal: Omit<ChangeNode, 'id'> = {
        type: 'change',
        title: 'Fix',
        description: '',
        files: [],
        status: 'proposed',
        proposedBy: 'worker',
        proposedAt: new Date().toISOString(),
        approvedBy: [],
        rejectedBy: [],
        votes: [],
        qualityGate,
        satisfiesGoals: [],
      };
      const change = await graph.add(proposal);
      const events: CoordinatorEvent[] = [];
      const host = {
        consensus,
        changes,
        selfAgentId: 'leader',
        emit: (event: CoordinatorEvent) => events.push(event),
      };
      await voteOnPendingChange(host, { id: change.id, qualityGate });
      expect(consensus.getStatus(change.id)?.outcome).toBe('quorum_not_met');
      expect(graph.get(change.id)).toMatchObject({ status: 'proposed', votes: [] });
      await voteOnPendingChange(host, { id: 'missing', qualityGate });
      expect(events).toEqual([]);
    },
  );
});
