/**
 * VCS adapters and the isolated `git`/`jj`/`hg` runner. Public as
 * `@wrongstack/core/vcs` for packages extracted from core (worktree).
 */
export {
  detectVcs,
  GIT_ISOLATION_ARGS,
  gitFilterIsolationEnv,
  HG_ISOLATED_ENV,
  normalizeVcsPath,
  openVcs,
  type VcsAdapter,
  type VcsKind,
  type VcsOptions,
  vcsAdapter,
} from './vcs-adapter.js';
export { runVcs, type VcsRunner, type VcsRunOptions, type VcsRunResult } from './vcs-runner.js';
