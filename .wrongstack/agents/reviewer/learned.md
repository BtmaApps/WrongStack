# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T15:54:45.752Z; skill=chimera; applied=1; wins=1; skipped=13; skippedWins=13 -->
- **- In `packages/tools/src/project-kit/**`, kit-name and path validation is centralized: `assertKitId`/`KIT_ID` (`catalog.ts`) constrain names before any join, and `kitPath` (`catalog.ts`) rejects `..`/`.`/empty components plus `\` and `:` and rejects symlinks at every component. Do not report kit path traversal or symlink escape as a defect in this subsystem without first reading `catalog.ts`; re-verify only if a new caller joins an unvalidated name. - When a review bundle lists added files that import sibling modules it does not list (e.g. `project-kit.ts` importing `./project-kit/service.js` and `runner.js`), read those siblings with `read` to confirm the exported signatures, and report a missing-module/contract break only if the sibling is actually absent on disk — `glob` the directory first.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tools/src/project-kit/**`
  - *How:* `assertKitId`
  - *How:* `KIT_ID`
  - *How:* `catalog.ts`
  - *How:* `kitPath`
  - *How:* `..`
  - *How:* `.`
  - *How:* `\`
  - *How:* `:`
  - *How:* `project-kit.ts`
  - *How:* `./project-kit/service.js`
  - *How:* `runner.js`
  - *How:* `read`
  - *How:* `glob`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T11:29:13.411Z; skill=code-review; applied=1; wins=1; skipped=24; skippedWins=24 -->
- **When a `read` of a session-changed file returns the pre-diff baseline but the review bundle's provenance shows `file.external.edit`, do not report the change as missing — verify with a live `grep` for a distinctive new token (e.g. a newly added flag like `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`) before concluding; reads can serve stale snapshots after concurrent external edits.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `file.external.edit`
  - *How:* `grep`
  - *How:* `--no-ext-diff`
  - *How:* `packages/bench/src/suites/swebench-patch.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T09:01:53.803Z; skill=chimera; skipped=45; skippedWins=45 -->
- **When a test pins build-script flags via `toContain` on quoted literals (e.g. `'--no-compile-autoload-dotenv'` in `packages/cli/tests/standalone-update.test.ts` → `scripts/build-binaries.mjs`), verify three things in one pass against the live source: exact quote style of the literal, that the occurrence is not inside a comment or dead branch, and that the containing array actually reaches the `run('bun', args)` / spawn call site — a literal inside a never-executed array passes the grep test while guarding nothing.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `toContain`
  - *How:* `'--no-compile-autoload-dotenv'`
  - *How:* `packages/cli/tests/standalone-update.test.ts`
  - *How:* `scripts/build-binaries.mjs`
  - *How:* `run('bun', args)`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T14:27:49.710Z; skill=chimera; skipped=18; skippedWins=18 -->
- **When reviewing a test that flips a feature switch after `buildAgent(...)`/construction (e.g. `ctx.meta.featureToolCoach = false` in `packages/core/tests/core/agent-malformed-retry.test.ts`), confirm the gate is evaluated at run time via a closure over live state (e.g. `toolCoachEnabled = () => isToolCoachEnabled(a.ctx.meta, …)` in `packages/core/src/core/agent-loop.ts`) — if the flag were captured at construction the test would be a vacuous pass. Do not report dot-access assignment on an unknown index signature (`ctx.meta.featureToolCoach = false`) as a typecheck failure without first reading `tsconfig.base.json`: it only errors under `noPropertyAccessFromIndexSignature`, which this repo does not enable.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `buildAgent(...)`
  - *How:* `ctx.meta.featureToolCoach = false`
  - *How:* `packages/core/tests/core/agent-malformed-retry.test.ts`
  - *How:* `toolCoachEnabled = () => isToolCoachEnabled(a.ctx.meta, …)`
  - *How:* `packages/core/src/core/agent-loop.ts`
  - *How:* `tsconfig.base.json`
  - *How:* `noPropertyAccessFromIndexSignature`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T17:40:30.232Z; skill=chimera; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **When reviewing additions to `KitProcessResult`/`KitRunRecord` in `packages/tools/src/project-kit/`, verify the new fields are optional (`?: T | undefined`) and read only inside the `finish()` resolve literal in `runner.ts`; a parent-side timestamp recorded on the `failure` branch while `resultReceived` stays `false` is intentional (the contract is "terminal IPC message", not "result"), so do not flag it as a mismatch — flag only an undeclared field or a non-optional addition that breaks existing object literals.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `KitProcessResult`
  - *How:* `KitRunRecord`
  - *How:* `packages/tools/src/project-kit/`
  - *How:* `?: T | undefined`
  - *How:* `finish()`
  - *How:* `runner.ts`
  - *How:* `failure`
  - *How:* `resultReceived`
  - *How:* `false`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T17:44:27.647Z; skipped=1; skippedWins=1 -->
- **Always verify a newly added early-exit guard like `if (x && err !== undefined)` against the `catch` that assigns `err` before judging it inverted — in `packages/plugins/src/semver-bump/index.ts` the skip-tag branch (:513) is correct precisely because `commitError` is only ever set on failure, and warnings are assembled as `commit failed: …` then `tag failed: …` (:551-554), so `toEqual` tests on `warnings` must match that exact order and literal prefix. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `if (x && err !== undefined)`
  - *How:* `catch`
  - *How:* `err`
  - *How:* `packages/plugins/src/semver-bump/index.ts`
  - *How:* `commitError`
  - *How:* `commit failed: …`
  - *How:* `tag failed: …`
  - *How:* `toEqual`
  - *How:* `warnings`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T16:53:17.506Z; skill=testing; skipped=10; skippedWins=10 -->
- **When reviewing an exact-equality assertion on captured process output (e.g. `expect(res.out).toBe(...)` in `packages/cli/tests/goal-commands-runcmd.test.ts`), verify the emitted size against the implementation's tail cap — `runCmd` keeps only the last `MAX_CMD_OUTPUT` (200_000) chars via `createTailBuffer` in `packages/cli/src/goal-commands.ts`, so an assertion over more output than the cap is vacuously failing rather than guarding the decode path. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `expect(res.out).toBe(...)`
  - *How:* `packages/cli/tests/goal-commands-runcmd.test.ts`
  - *How:* `runCmd`
  - *How:* `MAX_CMD_OUTPUT`
  - *How:* `createTailBuffer`
  - *How:* `packages/cli/src/goal-commands.ts`
  - *How:* `json { "findings": [] }`

---
*Last capture: 2026-09-28T17:44:27.647Z · 7 entries*
