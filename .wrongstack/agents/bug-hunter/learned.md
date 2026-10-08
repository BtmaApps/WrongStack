# Learned instructions for `bug-hunter`

> Project-specific learning data for the `bug-hunter` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T09:25:10.464Z; skill=typescript-strict; applied=1; wins=1; skipped=4; skippedWins=4 -->
- **Before applying any cascade fix on a co-modified tree, diff the exact path twice across the adjudication (`git diff --stat` then `git diff -U0 -- <path>` via `exec`) — an in-flight feature owner routinely lands the dedup between snapshots, and a guarded-edit no-match refusal means "re-anchor to live text," never "retry unchanged." A clean package typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`) plus the covering vitest files is the decisive close-out for false-positive missing-field claims like `packages/webui-hq/src/data/local-prefs.ts:hideIdle`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git diff --stat`
  - *How:* `git diff -U0 -- <path>`
  - *How:* `exec`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts:hideIdle`
  - *How:* `packages/webui-hq/src/data/local-prefs.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T15:01:07.367Z; skill=typescript-strict; skipped=3; skippedWins=3 -->
- **Never trust a visually-rendered `read` of a single trailing delimiter char when adjudicating mismatched-quote findings — run the package typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`) and slice the exact bytes with PowerShell (`(Get-Content <path>)[n][-30..-1] -join ''`) before declaring a false positive. Also avoid fixing single chars via PowerShell `String.Replace` in double-quoted strings: the backtick is an escape character there and the match silently fails; use the guarded `edit` tool instead.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `node node_modules/typescript/bin/tsc --noEmit --pretty false -p <pkg>/tsconfig.json`
  - *How:* `(Get-Content <path>)[n][-30..-1] -join ''`
  - *How:* `String.Replace`
  - *How:* `edit`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T15:09:08.576Z; skill=testing -->
- **Always falsify "wrong module identity" claims about `syncBuiltinESMExports()` in `packages/core/tests/coordination/single-instance-mailbox.test.ts` by (1) checking the consumer's access style — `import * as fsp` + `fsp.readFile` property reads in `packages/core/src/coordination/single-instance-mailbox.ts` are live namespace accesses that `syncBuiltinESMExports()` is documented to update, and (2) asking whether the test is self-falsifying: if the patch missed, the `rejects.toMatchObject({ code: 'EBUSY' })` assertion fails loudly ("resolved instead of rejected"), so a green run proves the SUT was patched. Node's `module.syncBuiltinESMExports()` bridges CJS-export mutations to builtin ESM namespaces by design — reject review claims that it "does not re-link consumer import bindings" without an executed counterexample.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `syncBuiltinESMExports()`
  - *How:* `packages/core/tests/coordination/single-instance-mailbox.test.ts`
  - *How:* `import * as fsp`
  - *How:* `fsp.readFile`
  - *How:* `packages/core/src/coordination/single-instance-mailbox.ts`
  - *How:* `rejects.toMatchObject({ code: 'EBUSY' })`
  - *How:* `module.syncBuiltinESMExports()`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:01:21.246Z; skill=testing; skipped=6; skippedWins=6 -->
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
*Last capture: 2026-10-08T15:09:08.576Z · 4 entries*
