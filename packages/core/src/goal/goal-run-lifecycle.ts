import type { WorktreeManager } from '../worktree/worktree-manager.js';
import type { PhaseStore } from './phase-store.js';
import type { PhaseGraph } from './types.js';

/** Serialize live and terminal snapshots in the order the host submits them. */
export class GoalRunPersistence {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly store: Pick<PhaseStore, 'save'>) {}

  save(graph: PhaseGraph): Promise<void> {
    const next = this.tail.then(() => this.store.save(graph));
    this.tail = next.catch(() => undefined);
    return next;
  }

  drain(): Promise<void> {
    return this.tail;
  }
}

/**
 * Shared CLI/WebUI preflight for restarting a persisted phase graph.
 * Refuses to strand unmerged work or retry terminal failures implicitly.
 */
export async function prepareGoalGraphForResume(
  graph: PhaseGraph,
  worktrees?: WorktreeManager | undefined,
): Promise<void> {
  if (
    graph.failedPhaseIds.length > 0 ||
    Array.from(graph.phases.values()).some((phase) => phase.status === 'failed')
  ) {
    throw new Error('Retry the failed task on the saved board before resuming this Goal.');
  }
  const incomplete = Array.from(graph.phases.values()).filter(
    (phase) => phase.status !== 'completed' && phase.status !== 'skipped',
  );
  if (incomplete.length === 0) throw new Error('This Goal is already complete.');
  if (graph.worktrees === true && !worktrees) {
    throw new Error('Saved Goal requires git worktrees, but this project is not a git checkout.');
  }

  if (graph.worktrees !== false && worktrees) {
    const managed = await worktrees.listManaged();
    const retainedWork = managed.worktrees.length > 0 || managed.branches.length > 0;
    const interruptedWithoutIdentity = incomplete.some(
      (phase) =>
        (phase.status === 'paused' || phase.status === 'running') &&
        !phase.metadata?.['worktreeResume'],
    );
    const anyIdentity = incomplete.some((phase) => Boolean(phase.metadata?.['worktreeResume']));
    if (
      retainedWork &&
      (interruptedWithoutIdentity || (graph.worktrees === undefined && !anyIdentity))
    ) {
      throw new Error(
        'This older Goal has an unmerged worktree without a saved phase identity. Review that worktree before resuming.',
      );
    }
    if (graph.worktrees === undefined) graph.worktrees = anyIdentity;
  }
  if (graph.worktrees === undefined) graph.worktrees = false;

  // A requeued task may have invalidated a previous terminal verdict. The
  // resumed orchestrator will rerun the merged-tree gate before completion.
  graph.completedAt = undefined;
  graph.finalVerification = undefined;
}
