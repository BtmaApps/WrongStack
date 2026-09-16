# Git Workflow (Compact)

Commit, branch, resolve, and recover without damaging the repository, following its own conventions.

## Rules

1. Commit, push, or open a PR only when the user asked.
2. Check status and the staged diff before committing; stage explicit paths, never `git add -A` in a shared worktree.
3. Match the repository's message and branch conventions from recent history.
4. Never bypass hooks or signing; fix what the hook reports.
5. Inspect before destructive commands (reset --hard, clean, branch -D, force push) and prefer the recoverable path.
6. Don't rewrite shared history; use `--force-with-lease` only on your own branch.
7. One concern per commit; the message explains why.

## Recovery

- Lost commit: `git reflog` then `git branch rescue <sha>`.
- Undo a pushed commit: `git revert <sha>`.
- Broke something: `git bisect run <test command>`.
