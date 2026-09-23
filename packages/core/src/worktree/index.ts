export { type GitWorktreeEntry, listGitWorktrees } from './git-worktree-list.js';
export {
  WorktreeManager,
  assertSafePath,
  type WorktreeHandle,
  type WorktreeStatus,
  type WorktreeManagerOptions,
  type AllocateOpts,
  type MergeOpts,
  type MergeResult,
  type RunResult as WorktreeRunResult,
} from './worktree-manager.js';
