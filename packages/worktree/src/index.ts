export { type GitWorktreeEntry, listGitWorktrees } from './git-worktree-list.js';
export { holdManagedWorktree, isManagedWorktreeHeld } from './worktree-hold.js';
export {
  type AllocateOpts,
  assertSafePath,
  type MergeOpts,
  type MergeResult,
  type RunResult as WorktreeRunResult,
  type WorktreeHandle,
  WorktreeManager,
  type WorktreeManagerOptions,
  type WorktreeStatus,
} from './worktree-manager.js';
