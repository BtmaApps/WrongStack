import { dirname } from 'node:path';
import type { EventBus } from '@wrongstack/contracts/kernel/events';
import { holdManagedWorktree, WorktreeManager } from '@wrongstack/worktree';
import type { PhaseGraph } from './types.js';

/** Workspace holds by Goal id; released when the run gives up its lease. */
const workspaceHolds = new Map<string, Promise<() => Promise<void>>>();

/**
 * Release the hold `prepareGoalWorkspace` put on this Goal's checkout. Call it
 * where the run's lease is released. A host that never calls it keeps the
 * checkout protected until the process exits — the safe direction.
 */
export async function releaseGoalWorkspaceHold(goalId: string): Promise<void> {
  const hold = workspaceHolds.get(goalId);
  if (!hold) return;
  workspaceHolds.delete(goalId);
  await (await hold)();
}

/** Each goal integrates its phases into its own branch, never another goal's tree. */
export async function prepareGoalWorkspace(
  projectRoot: string,
  graph: PhaseGraph,
  events?: EventBus,
): Promise<string> {
  const manager = new WorktreeManager({ projectRoot, events, sessionId: graph.sessionId });
  const handle = graph.workspace
    ? await manager.adopt(`goal:${graph.id}`, { ...graph.workspace, ownerLabel: graph.title })
    : await manager.allocate(`goal:${graph.id}`, {
        slugHint: `goal-${graph.id}`,
        ownerLabel: graph.title,
      });
  if (handle.status !== 'active')
    throw new Error(handle.lastError ?? 'Cannot allocate an isolated Goal checkout.');
  graph.workspace = { dir: handle.dir, branch: handle.branch, baseBranch: handle.baseBranch };
  // The checkout outlives this throwaway manager, so handle-free sweeps (an SDD
  // run's stale sweep, the worktree panel) must be told it is live.
  if (!workspaceHolds.has(graph.id)) {
    workspaceHolds.set(
      graph.id,
      holdManagedWorktree(dirname(handle.dir), handle.dir, `goal:${graph.id}`),
    );
  }
  await workspaceHolds.get(graph.id);
  return handle.dir;
}
