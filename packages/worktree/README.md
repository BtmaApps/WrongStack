# @wrongstack/worktree

Git-worktree isolation: `WorktreeManager` allocates a checkout and branch per
owner (a Goal phase or a Director fleet task), commits its work, squash-merges
it back with an optional conflict resolver and releases it. `listGitWorktrees`
parses `git worktree list --porcelain`.

Extracted from `@wrongstack/core` (`src/worktree/`) on 2026-10-24. It depends on
core's public subpaths (`vcs`, `utils`); core does not depend on it. Core's
Director takes a `WorktreeManagerPort` (`@wrongstack/contracts/types/worktree`),
so hosts pass a `WorktreeManager` in.
