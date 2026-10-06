# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:01:21.246Z; skill=testing -->
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
*Last capture: 2026-10-06T12:01:21.246Z · 1 entries*
