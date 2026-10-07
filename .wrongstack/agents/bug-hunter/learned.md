# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T09:25:10.464Z; skill=typescript-strict; skipped=1; skippedWins=1 -->
- **Before applying any cascade fix on a co-modified tree, diff the exact path twice across the adjudication (`git diff --stat` then `git diff -U0 -- <path>` via `exec`) — an in-flight feature owner routinely lands the dedup between snapshots, and a guarded-edit no-match refusal means "re-anchor to live text," never "retry unchanged." A clean package typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`) plus the covering vitest files is the decisive close-out for false-positive missing-field claims like `packages/webui-hq/src/data/local-prefs.ts:hideIdle`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git diff --stat`
  - *How:* `git diff -U0 -- <path>`
  - *How:* `exec`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts:hideIdle`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:01:21.246Z; skill=testing; skipped=2; skippedWins=2 -->
- **Always falsify Chimera self-recursion and guard-omission claims by reading the live co-modified file before patching — in this repository the reviewer snapshot routinely lags an in-flight edit, and the suggested fix is often already present verbatim (e.g. `packages/core/src/goal/mission-refinement.ts` `notify` wrapper calling `opts?.onError?.(...)` and the dual `opts?.signal?.aborted` / `timer.signal.aborted` post-await checks). Anchor the adjudication with `git status --short -- <path>`, a full live read of the cited lines, and the covering suite (`pnpm exec vitest run packages/core/tests/goal/mission-refinement.test.ts`), then report resolved instead of applying duplicate logic.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/goal/mission-refinement.ts`
  - *How:* `notify`
  - *How:* `opts?.onError?.(...)`
  - *How:* `opts?.signal?.aborted`
  - *How:* `timer.signal.aborted`
  - *How:* `git status --short -- <path>`
  - *How:* `pnpm exec vitest run packages/core/tests/goal/mission-refinement.test.ts`
  - *How:* `packages/core/tests/goal/mission-refinement.test.ts`

---
*Last capture: 2026-10-07T09:25:10.464Z · 2 entries*
