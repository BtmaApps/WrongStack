# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-03T09:01:52.973Z; skill=chimera; applied=10; wins=10; skipped=24; skippedWins=24 -->
- **Always resolve the on-disk location of a new import subpath before crediting it — for example `parseNativeCloudSettings` from `@wrongstack/core/cloud-provider` may live in a flat `packages/core/src/cloud-provider.ts` rather than a directory, so `grep` with a directory `path` errors out and must be retried as a file glob. Never treat a `glob` result of 0 files as a missing module when the pattern used brace expansion (e.g. `packages/webui-protocol/src/{automation,code-assist}.ts`) — many glob backends do not expand braces, so the miss is inconclusive. Re-probe with one explicit path per call before reporting a broken re-export in `packages/webui-protocol/src/index.ts`. When reviewing a new `export *` line in a package barrel such as `packages/webui-protocol/src/index.ts`, verify both that the target module exists AND that no two `export *` sources export the same symbol name — an ambiguous name is a package-wide compile break that no single-file review would catch.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `parseNativeCloudSettings`
  - *How:* `@wrongstack/core/cloud-provider`
  - *How:* `packages/core/src/cloud-provider.ts`
  - *How:* `grep`
  - *How:* `path`
  - *How:* `glob`
  - *How:* `packages/webui-protocol/src/{automation,code-assist}.ts`
  - *How:* `packages/webui-protocol/src/index.ts`
  - *How:* `export *`
  - *How:* `@wrongstack/core`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:42:18.752Z; skipped=42; skippedWins=42 -->
- **Always `glob` each target of a removed documentation index row (e.g. rows dropped from `docs/README.md`) before calling it link rot — the removal is correct when the file or directory no longer exists on disk, and a finding is only valid when the target still exists. Equally, resolve every newly added relative link and heading anchor (e.g. `docs/toolflow.md#measured-contribution` against the live `##` heading) before declaring a docs diff clean. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `glob`
  - *How:* `docs/README.md`
  - *How:* `docs/toolflow.md#measured-contribution`
  - *How:* `##`
  - *How:* `json { "findings": [] }`
  - *How:* `docs/toolflow.md`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T12:46:55.661Z; skill=testing; applied=6; wins=6; skipped=4; skippedWins=4 -->
- **Always read `resolveReal` in `packages/tools/src/design.ts` before flagging any ENOENT hard-fail in the design tool's path guards (`assertProjectRelative`, materialize `out`) — it walks up parents on ENOENT and falls back to `path.resolve`, so not-yet-existing capture/verify/materialize paths cannot crash the guard. Treat kit-vs-capture precedence for design verify as documented at `packages/core/src/execution/design-project-store.ts` (`resolveVerifyTokens`): a pinned-but-unreadable kit returns `undefined` rather than falling back to `.design/captured-tokens.json`. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `resolveReal`
  - *How:* `packages/tools/src/design.ts`
  - *How:* `assertProjectRelative`
  - *How:* `out`
  - *How:* `path.resolve`
  - *How:* `packages/core/src/execution/design-project-store.ts`
  - *How:* `resolveVerifyTokens`
  - *How:* `undefined`
  - *How:* `.design/captured-tokens.json`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T13:00:39.093Z; applied=4; wins=4; skipped=1; skippedWins=1 -->
- **Always resolve `DESIGN_STACKS` in `packages/core/src/types/design-kit.ts` before crediting a design-kit-loader test regex like `/no valid stack.*web, react-native, flutter, swiftui, compose/` — the skipped-kit reason at `packages/core/src/execution/design-kit-loader.ts` interpolates `DESIGN_STACKS.join(', ')`, so both the membership and the order of the regex's trailing list must match the literal array, and a wrong order fails the test rather than the production path. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `DESIGN_STACKS`
  - *How:* `packages/core/src/types/design-kit.ts`
  - *How:* `/no valid stack.*web, react-native, flutter, swiftui, compose/`
  - *How:* `packages/core/src/execution/design-kit-loader.ts`
  - *How:* `DESIGN_STACKS.join(', ')`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T05:20:47.224Z; skill=bug-hunter; applied=5; wins=5; skipped=64; skippedWins=64 -->
- **Always treat `STALE_WRITE_PREFIX` throws from `packages/kanban/src/verification/` as retry signals, not bugs: `verificationStateFingerprint` in `packages/kanban/src/verification/task-inputs.ts` hashes the full descendant/dependency task tree plus board policy (only `updatedAt`, `notes`, `links`, `labels`, `order`, `dueDate`, and assignment `heartbeatAt`/`leaseExpiresAt` are excluded), so any concurrent write during a gate→verify→finalize sequence intentionally fails closed with "Re-run the completion gate". `assertAcceptedContractUnchanged` in `packages/kanban/src/manager/lifecycle/accepted-contract.ts` fires only for managed boards with `currentStage === 'done'` and compares input fingerprints (statuses excluded) plus `[check.id, check.status]` outcomes, with a `verdict === 'passed'` escape for fresh passing reports. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `STALE_WRITE_PREFIX`
  - *How:* `packages/kanban/src/verification/`
  - *How:* `verificationStateFingerprint`
  - *How:* `packages/kanban/src/verification/task-inputs.ts`
  - *How:* `updatedAt`
  - *How:* `notes`
  - *How:* `links`
  - *How:* `labels`
  - *How:* `order`
  - *How:* `dueDate`
  - *How:* `heartbeatAt`
  - *How:* `leaseExpiresAt`
  - *How:* `assertAcceptedContractUnchanged`
  - *How:* `packages/kanban/src/manager/lifecycle/accepted-contract.ts`
  - *How:* `currentStage === 'done'`
  - *How:* `[check.id, check.status]`
  - *How:* `verdict === 'passed'`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T06:45:06.213Z; skipped=57; skippedWins=57 -->
- **Always verify a changed responsive-split test expectation by recomputing the slot arithmetic from the live constants rather than trusting the diff's comment: `calculateDesktopActivityCapacity` in `packages/webui/src/components/activity-bar/index.tsx` derives slots from `COMPACT_/FULL_RESERVED_PX` and `_SLOT_PX`, and `splitDesktopActivityBarItems` gives remaining slots to the first N of the on-disk `VIEWS` order — so inserting a view (e.g. `automation`) shifts which ids appear in `visibleViewIds` without any capacity change. Confirm both the capacity math and the current `VIEWS` ordering before judging such a test flip correct or masking. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `calculateDesktopActivityCapacity`
  - *How:* `packages/webui/src/components/activity-bar/index.tsx`
  - *How:* `COMPACT_/FULL_RESERVED_PX`
  - *How:* `_SLOT_PX`
  - *How:* `splitDesktopActivityBarItems`
  - *How:* `VIEWS`
  - *How:* `automation`
  - *How:* `visibleViewIds`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T08:30:07.243Z; skill=testing; applied=5; wins=5; skipped=40; skippedWins=40 -->
- **Always verify tests claiming "without global env changes" against the live env-layering mechanism, not just the test text: in `packages/providers/src/native-catalog.ts`, `endpointEnv` (line ~57) is a per-provider spread copy of `process.env` plus profile-scoped `AZURE_RESOURCE_NAME`/`AWS_REGION`/`GOOGLE_VERTEX_*` values — a copy, not a mutation — so such tests pass via real per-closure isolation, and any regression to writing `process.env` or to env-fallback precedence breaks a concrete URL `toContain` assertion. [skill: testing]**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/providers/src/native-catalog.ts`
  - *How:* `endpointEnv`
  - *How:* `process.env`
  - *How:* `AZURE_RESOURCE_NAME`
  - *How:* `AWS_REGION`
  - *How:* `GOOGLE_VERTEX_*`
  - *How:* `toContain`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T06:01:39.372Z; applied=1; wins=1; skipped=60; skippedWins=60 -->
- **When a diff extracts functions into a new sibling module and re-exports them (e.g. `recoverStaleTaskAssignments` → `assignment-recovery.ts`, `runProcess`/`runGitCommand` → `verification-process.ts`), verify the sibling exists on disk and exports the exact re-exported names before treating any call site as broken — a missing or mis-named export is a package-wide compile break the diff itself will not show.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `recoverStaleTaskAssignments`
  - *How:* `assignment-recovery.ts`
  - *How:* `runProcess`
  - *How:* `runGitCommand`
  - *How:* `verification-process.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-03T06:41:02.058Z; skill=chimera; applied=1; wins=1; skipped=57; skippedWins=57 -->
- **When a diff swaps an allowlist entry from one file path to another (e.g. a helper extraction moving a `shell:` spawn from `verification-context.ts` to `verification-process.ts`), verify both sides before approving: grep `child_process` in the **removed** path — if it no longer imports `child_process`, the `IMPORTS_CHILD_PROCESS` filter in `packages/tools/tests/architecture/shell-true-parity.test.ts` drops its `shell:` lines before the allowlist check, so removing the entry is safe rather than silently un-vetting a live site; and confirm the **added** path both exists and contains a non-inert `shell:` value, since the allowlist uses `endsWith` and a dead entry masks nothing while a missing one turns the gate red.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `shell:`
  - *How:* `verification-context.ts`
  - *How:* `verification-process.ts`
  - *How:* `child_process`
  - *How:* `IMPORTS_CHILD_PROCESS`
  - *How:* `packages/tools/tests/architecture/shell-true-parity.test.ts`
  - *How:* `endsWith`

<!-- learned-stamp: category=convention; capturedAt=2026-10-02T19:49:25.354Z; skipped=94; skippedWins=94 -->
- **When registering a new tool name or alias in the icon system, update BOTH maps — `packages/tools/src/tool-icon-map.ts` (canonical UI map, re-exported from `packages/tools/src/index.ts`) and `packages/tools/src/tool-icons.ts` (pure-data map + `TOOL_ICON_CONFIG` colors) — because they are maintained in parallel by convention, not by a shared source or parity test; a divergence only degrades the icon to `fallback`, which no gate catches. Any icon id used must already exist in `TOOL_ICON_CONFIG` and the `ToolIconId` union. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/tools/src/tool-icon-map.ts`
  - *How:* `packages/tools/src/index.ts`
  - *How:* `packages/tools/src/tool-icons.ts`
  - *How:* `TOOL_ICON_CONFIG`
  - *How:* `fallback`
  - *How:* `ToolIconId`
  - *How:* `json { "findings": [] }`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-03T05:40:17.327Z; skill=code-review; applied=1; wins=1; skipped=63; skippedWins=63 -->
- **Always verify a vitest `exclude` "allowlist" against the on-disk config before flagging it as ineffective — in `vitest.config.ts`, exclusion lists are additive with no negative glob, so the allowlist works only if the broad entry (e.g. `packages/webui/**`) was actually *removed*; review-bundle diffs can show that broad entry as unchanged context even after a later edit deleted it. Read the live file (`read vitest.config.ts` around the `exclude:` block) and confirm the broad pattern is gone before concluding the subtree excludes are dead code. ```json { "findings": [] } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `exclude`
  - *How:* `vitest.config.ts`
  - *How:* `packages/webui/**`
  - *How:* `read vitest.config.ts`
  - *How:* `exclude:`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-02T20:21:02.155Z; skill=chimera; applied=11; wins=11; skipped=71; skippedWins=71 -->
- **When a new chronicle test asserts `String(attributes.<previewField>).length < N`, verify what `capPreview` in `packages/core/src/chronicle/tool-adapter.ts` actually returns before crediting it: the truncated branch returns an object `{preview, truncated, totalBytes}`, so `String()` collapses it to `"[object Object]"` and the assertion is unconditional. Prefer asserting the object shape, or asserting `attributes.<previewField>.preview.length`. Also require the same test to assert a pre-truncation-derived field such as `fileStats` from `file-tool-stats.ts`, because that field is the only thing proving stats are computed from the full output before `capPreview`.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `String(attributes.<previewField>).length < N`
  - *How:* `capPreview`
  - *How:* `packages/core/src/chronicle/tool-adapter.ts`
  - *How:* `{preview, truncated, totalBytes}`
  - *How:* `String()`
  - *How:* `"[object Object]"`
  - *How:* `attributes.<previewField>.preview.length`
  - *How:* `fileStats`
  - *How:* `file-tool-stats.ts`

---
*Last capture: 2026-10-03T13:00:39.093Z · 12 entries*
