# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T15:54:45.752Z; skill=chimera; applied=3; wins=3; skipped=50; skippedWins=50 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:19:26.838Z; skill=chimera; applied=1; wins=1; skipped=18; skippedWins=18 -->
- **Never emit an all-clear banner when a scoped file's changed region was hidden by `[artifact middle omitted]`, and never file a Medium+ finding you could not cite against a line you actually read this session. State the uncovered `file:line` ranges explicitly, and prefer `completion: "partial"` with `{"findings": []}` over a clean report that implies full coverage.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `[artifact middle omitted]`
  - *How:* `file:line`
  - *How:* `completion: "partial"`
  - *How:* `{"findings": []}`

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:15:29.606Z; skill=chimera; applied=2; wins=2; skipped=21; skippedWins=21 -->
- **When a `read` of a large file returns a persisted log with `[artifact middle omitted]`, do not treat the head/tail as full coverage and do not emit an all-clear banner. Re-issue range reads with a fresh `offset`/`limit` (e.g. `offset=1 limit=250`, then `offset=251`) until the changed region is seen, and if the review must conclude early, report the specific uncovered `file:line` ranges and set `completion: "partial"` rather than returning `{"findings": []}` for the whole bundle. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `[artifact middle omitted]`
  - *How:* `offset`
  - *How:* `limit`
  - *How:* `offset=1 limit=250`
  - *How:* `offset=251`
  - *How:* `file:line`
  - *How:* `completion: "partial"`
  - *How:* `{"findings": []}`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T11:29:13.411Z; skill=code-review; applied=3; wins=3; skipped=61; skippedWins=61 -->
- **When a `read` of a session-changed file returns the pre-diff baseline but the review bundle's provenance shows `file.external.edit`, do not report the change as missing — verify with a live `grep` for a distinctive new token (e.g. a newly added flag like `--no-ext-diff` in `packages/bench/src/suites/swebench-patch.ts`) before concluding; reads can serve stale snapshots after concurrent external edits.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `file.external.edit`
  - *How:* `grep`
  - *How:* `--no-ext-diff`
  - *How:* `packages/bench/src/suites/swebench-patch.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T21:57:42.060Z; skill=chimera; applied=5; wins=5; skipped=33; skippedWins=33 -->
- **When a diff touches `packages/webui/src/types/sage.ts` (the WebUI mirror of `packages/sage/src/memory-model.ts`), verify field sets 1:1 in BOTH directions by reading both files — the guard is `packages/webui/tests/types/sage-type-contract.test.ts`, which compares declared property names of `Sage`↔`SageEntry` and `MemoryAnchor`↔`SageAnchor`. `kind: string` (vs the closed `SageKind` union) and canonical-required `sources` being optional in the mirror are deliberate safe widenings, not drift — do not report them.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/src/types/sage.ts`
  - *How:* `packages/sage/src/memory-model.ts`
  - *How:* `packages/webui/tests/types/sage-type-contract.test.ts`
  - *How:* `Sage`
  - *How:* `SageEntry`
  - *How:* `MemoryAnchor`
  - *How:* `SageAnchor`
  - *How:* `kind: string`
  - *How:* `SageKind`
  - *How:* `sources`

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:32:12.886Z; skill=chimera; applied=2; wins=2; skipped=10; skippedWins=10 -->
- **When a handler diff threads a new behavior flag (e.g. `failOnEmbeddingError`) into a store/API call in `packages/webui-server/src/server/http-server/*-handlers.ts` but the corresponding store diff shows no consumption, verify with `grep <flagName> packages/<store-pkg>/src/*.ts` before judging — mocked-store tests in `packages/webui-server/tests/` pass regardless, so a green test suite cannot distinguish a live option from dead wiring. If verification is cut off, report it as an explicit unverified risk in the summary rather than filing a finding whose citation cannot be confirmed.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `failOnEmbeddingError`
  - *How:* `packages/webui-server/src/server/http-server/*-handlers.ts`
  - *How:* `grep <flagName> packages/<store-pkg>/src/*.ts`
  - *How:* `packages/webui-server/tests/`

<!-- learned-stamp: category=warning; capturedAt=2026-09-29T18:19:26.838Z; skill=code-review; applied=1; wins=1; skipped=18; skippedWins=18 -->
- **When a review bundle lists changed files but omits the diff hunks, do not substitute a full-file `read` for the missing diff in large files — `read` returns `[artifact middle omitted]` and the read cache then refuses range re-reads as "unchanged since previous read," permanently hiding the changed region. Use `grep` with `context_lines` over function names in the file instead; `grep` is not subject to the read cache, so it is the reliable fallback for reaching a specific region of an already-read file.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `read`
  - *How:* `[artifact middle omitted]`
  - *How:* `grep`
  - *How:* `context_lines`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T09:01:53.803Z; skill=chimera; applied=1; wins=1; skipped=83; skippedWins=83 -->
- **When a test pins build-script flags via `toContain` on quoted literals (e.g. `'--no-compile-autoload-dotenv'` in `packages/cli/tests/standalone-update.test.ts` → `scripts/build-binaries.mjs`), verify three things in one pass against the live source: exact quote style of the literal, that the occurrence is not inside a comment or dead branch, and that the containing array actually reaches the `run('bun', args)` / spawn call site — a literal inside a never-executed array passes the grep test while guarding nothing.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `toContain`
  - *How:* `'--no-compile-autoload-dotenv'`
  - *How:* `packages/cli/tests/standalone-update.test.ts`
  - *How:* `scripts/build-binaries.mjs`
  - *How:* `run('bun', args)`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T14:27:49.710Z; skill=chimera; applied=2; wins=2; skipped=55; skippedWins=55 -->
- **When reviewing a test that flips a feature switch after `buildAgent(...)`/construction (e.g. `ctx.meta.featureToolCoach = false` in `packages/core/tests/core/agent-malformed-retry.test.ts`), confirm the gate is evaluated at run time via a closure over live state (e.g. `toolCoachEnabled = () => isToolCoachEnabled(a.ctx.meta, …)` in `packages/core/src/core/agent-loop.ts`) — if the flag were captured at construction the test would be a vacuous pass. Do not report dot-access assignment on an unknown index signature (`ctx.meta.featureToolCoach = false`) as a typecheck failure without first reading `tsconfig.base.json`: it only errors under `noPropertyAccessFromIndexSignature`, which this repo does not enable.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `buildAgent(...)`
  - *How:* `ctx.meta.featureToolCoach = false`
  - *How:* `packages/core/tests/core/agent-malformed-retry.test.ts`
  - *How:* `toolCoachEnabled = () => isToolCoachEnabled(a.ctx.meta, …)`
  - *How:* `packages/core/src/core/agent-loop.ts`
  - *How:* `tsconfig.base.json`
  - *How:* `noPropertyAccessFromIndexSignature`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T17:40:30.232Z; skill=chimera; applied=8; wins=8; skipped=33; skippedWins=33 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:00:53.962Z; skill=chimera; applied=3; wins=3; skipped=28; skippedWins=28 -->
- **Always re-read the changed function's live signature before filing a `noUnusedParameters`/`TS6133` finding from a review bundle: this repo's bundle generator can capture an intermediate `file.external.edit` state, so a parameter that the diff shows as unused may already have been removed on disk. Verify with `grep -n '^function <name>\|<paramName>' <file>` against the current file and cite the live line.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `noUnusedParameters`
  - *How:* `TS6133`
  - *How:* `file.external.edit`
  - *How:* `grep -n '^function <name>\|<paramName>' <file>`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T17:44:27.647Z; applied=3; wins=3; skipped=37; skippedWins=37 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T19:01:34.249Z; skill=code-review; skipped=3; skippedWins=3 -->
- **Treat any edit to `architecture/hotspots.json` as a ratchet that must be regenerated in the same change: `validateHotspotBaseline` in `scripts/lib/architecture-health.mjs` errors on *every* `lines` and `relativeImports` drift for files at or above `thresholdLines` (800), on any ≥800-line file missing from the baseline, and on baseline entries whose file dropped below the threshold. When reviewing the paired `docs/reports/architecture-health-current.md`, remember its "Largest production files" table is a fixed 50-row cap, so tail rows disappearing from a diff is cap reflow, not missing data. Files examined: `architecture/hotspots.json`, `docs/reports/architecture-health-current.md`, `scripts/lib/architecture-health.mjs`**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `architecture/hotspots.json`
  - *How:* `validateHotspotBaseline`
  - *How:* `scripts/lib/architecture-health.mjs`
  - *How:* `lines`
  - *How:* `relativeImports`
  - *How:* `thresholdLines`
  - *How:* `docs/reports/architecture-health-current.md`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:00:53.962Z; skill=chimera; applied=3; wins=3; skipped=28; skippedWins=28 -->
- **When a diff adds a new optional numeric field to a per-row result object (e.g. `SearchHit.bm25` in `packages/sage/src/sqlite-store-search.ts`), check that the backing array is initialized on **every** branch, not just the branch the feature targets — a `const x = rows.map(...)` declared only inside an FTS path makes the new field a TDZ `ReferenceError` on the plain channel. Cite the unconditional `const finalBm25 = ...` line as the clean evidence.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `SearchHit.bm25`
  - *How:* `packages/sage/src/sqlite-store-search.ts`
  - *How:* `const x = rows.map(...)`
  - *How:* `ReferenceError`
  - *How:* `const finalBm25 = ...`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T17:46:30.997Z; skill=chimera; applied=2; wins=2; skipped=32; skippedWins=32 -->
- **When a diff in `packages/tools/src/**` newly wires `.gitignore` filtering, verify against `packages/tools/src/codebase-index/gitignore.ts` before judging parity claims: `loadGitignoreMatcher(root)` reads ONLY the project-root `.gitignore` (no nested files, no `.git` requirement), returns `(relPath: string, isDir: boolean) => boolean`, and implements last-match-wins `!` negation plus trailing-slash dir-only rules — so "same file set as the rg path" holds only where ripgrep itself honors `.gitignore`; confirm the enumerator's `require_git` behavior rather than accepting the comment's parity claim.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/src/**`
  - *How:* `.gitignore`
  - *How:* `packages/tools/src/codebase-index/gitignore.ts`
  - *How:* `loadGitignoreMatcher(root)`
  - *How:* `.git`
  - *How:* `(relPath: string, isDir: boolean) => boolean`
  - *How:* `!`
  - *How:* `require_git`

<!-- learned-stamp: category=convention; capturedAt=2026-09-29T18:54:19.755Z; skill=testing; applied=1; wins=1; skipped=6; skippedWins=6 -->
- **When reviewing a `stateFingerprint`-style change-detector diff in `packages/webui-server/src/server/collab/session-registry.ts`, read the whole `collab/` package in the same pass — `broadcast-scheduler.ts` (`stateFingerprint` compare + `record()`) and `annotations.ts` hold the invariants a fingerprint edit can violate, and the correct verdict requires confirming the scheduler still detects the state change and does not over-trigger. When reviewing a numeric-normalization diff in `packages/webui-server/src/server/usage-cost.ts`, verify the fallback uses `!= null` rather than `||`/`??` so an explicit `0` cache price is preserved, and check the declared `CostRates`/`TokenUsage` field count against the `toEqual` assertions in `packages/webui-server/tests/usage-cost.test.ts` and the mock object in `packages/webui-server/tests/server-runtime.test.ts` — both enumerate all four keys exactly.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `stateFingerprint`
  - *How:* `packages/webui-server/src/server/collab/session-registry.ts`
  - *How:* `collab/`
  - *How:* `broadcast-scheduler.ts`
  - *How:* `record()`
  - *How:* `annotations.ts`
  - *How:* `packages/webui-server/src/server/usage-cost.ts`
  - *How:* `!= null`
  - *How:* `||`
  - *How:* `??`
  - *How:* `0`
  - *How:* `CostRates`
  - *How:* `TokenUsage`
  - *How:* `toEqual`
  - *How:* `packages/webui-server/tests/usage-cost.test.ts`
  - *How:* `packages/webui-server/tests/server-runtime.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T16:53:17.506Z; skill=testing; skipped=49; skippedWins=49 -->
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
*Last capture: 2026-09-29T19:01:34.249Z · 17 entries*
