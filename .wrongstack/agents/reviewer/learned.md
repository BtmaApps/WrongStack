# Learned instructions for `reviewer`

> Project-specific learning data for the `reviewer` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:03:06.867Z; skill=chimera; applied=17; wins=17; skipped=42; skippedWins=42 -->
- **When a consumer reads spec fields with `spec.model ?? fallback`, verify the producer normalizes blank strings to `undefined` (trim + `|| undefined` as in `resolveRefinerTargetSpecs` in `packages/core/src/execution/refiner-target.ts`) — `??` does not catch empty strings, so an un-normalized producer would ship empty model ids through. In never-throws provider wrappers, confirm observer callbacks (`onError`) are wrapped in try/catch inside the notify path — an unwrapped observer throw either escapes the never-throws contract or re-enters the catch and double-notifies as `provider_error`. ```json { "findings": [] } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `spec.model ?? fallback`
  - *How:* `undefined`
  - *How:* `|| undefined`
  - *How:* `resolveRefinerTargetSpecs`
  - *How:* `packages/core/src/execution/refiner-target.ts`
  - *How:* `??`
  - *How:* `onError`
  - *How:* `provider_error`
  - *How:* `json { "findings": [] }`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T14:58:02.209Z; skill=chimera; applied=1; wins=1; skipped=4; skippedWins=4 -->
- **- Always verify a parser's synthetic-line round-trip when a diff rewrites one syntax into another: `splitTableFormDependency` in `packages/techstack/src/adapters/rust.ts` emits `"key" = { … }` from a `[section.key]` header, and that is only safe because `parseTomlKeyValue` in `packages/techstack/src/adapters/parse-utils.ts` strips quoted keys — re-check the consuming parser's grammar (quote handling, comment stripping, bracket depth) rather than the happy-path unquoted key before crediting or rejecting the rewrite. - In this repo, treat `pnpm-workspace.yaml` `overrides:` as the authoritative dependency-override surface: top-level `overrides` in root `package.json` is the npm mechanism and inert under pnpm (which reads `pnpm.overrides` or the workspace yaml). When a diff raises an override floor to a same-day release, check the matching `minimumReleaseAgeExclude` entry exists under `minimumReleaseAge` — a fresh floor with no exclude can make `pnpm install` fail version resolution. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `splitTableFormDependency`
  - *How:* `packages/techstack/src/adapters/rust.ts`
  - *How:* `"key" = { … }`
  - *How:* `[section.key]`
  - *How:* `parseTomlKeyValue`
  - *How:* `packages/techstack/src/adapters/parse-utils.ts`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `overrides:`
  - *How:* `overrides`
  - *How:* `package.json`
  - *How:* `pnpm.overrides`
  - *How:* `minimumReleaseAgeExclude`
  - *How:* `minimumReleaseAge`
  - *How:* `pnpm install`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T13:24:00.232Z; applied=3; wins=3; skipped=28; skippedWins=28 -->
- **Always validate a handler's fall-through branch against the projection's full typed action union before approving a projection refactor: enumerate every variant of the returned discriminated union (e.g. `RefineResultAction` in `packages/core/src/execution/refine-decisions.ts`) and confirm each maps to exactly one branch of the consuming handler (e.g. `handleModelRefineResult` in `packages/webui/src/hooks/ws-handlers/misc-handlers.ts`) — a closed union makes the final `else`-style fall-through safe only when every unhandled variant is the intended one.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `RefineResultAction`
  - *How:* `packages/core/src/execution/refine-decisions.ts`
  - *How:* `handleModelRefineResult`
  - *How:* `packages/webui/src/hooks/ws-handlers/misc-handlers.ts`
  - *How:* `else`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T13:40:09.302Z; skill=chimera; applied=2; wins=2; skipped=25; skippedWins=25 -->
- **Always verify a new cross-package import like `treeKill` from `@wrongstack/core/utils/tree-kill` against the source module's exported signature and the subpath entry in `packages/core/package.json` `exports` before crediting the call site — and when a review is force-concluded before that read, name the unread anchor explicitly in remaining work instead of issuing an unqualified clean verdict.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `treeKill`
  - *How:* `@wrongstack/core/utils/tree-kill`
  - *How:* `packages/core/package.json`
  - *How:* `exports`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:37:09.028Z; applied=1; wins=1; skipped=48; skippedWins=48 -->
- **Always verify a removed re-export by grepping actual import sites of the re-exporting module (e.g. who imports `DEFAULT_PANEL_POSITIONS`/`PANEL_IDS` from `packages/tui/src/app-settings-type.ts`) rather than the symbol name repo-wide — consumers importing from the canonical source (`ui-contracts.js`) make the trim safe, and the distinguishing evidence is the import specifier, not the symbol.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `DEFAULT_PANEL_POSITIONS`
  - *How:* `PANEL_IDS`
  - *How:* `packages/tui/src/app-settings-type.ts`
  - *How:* `ui-contracts.js`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T15:23:05.448Z; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **When a diff removes type re-exports from a barrel-style module (e.g. `export type { … } from './protocol-contract.js'` in `packages/acp/src/agent/protocol-handler.ts`), enumerate every import site of that module and read each multi-line import directly — a line-by-line `grep` of `import[^;]*Name` misses names on continuation lines of multi-line import blocks, so it cannot alone prove a removed export has no consumers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `export type { … } from './protocol-contract.js'`
  - *How:* `packages/acp/src/agent/protocol-handler.ts`
  - *How:* `grep`
  - *How:* `import[^;]*Name`
  - *How:* `./protocol-contract.js`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T13:57:55.083Z; skill=chimera; skipped=18; skippedWins=18 -->
- **When a side-request copies the main attempt's per-provider adaptation (e.g. `adaptDocumentsForModel` in `packages/core/src/utils/document-blocks.ts` used by `packages/core/src/core/next-steps-required.ts`), verify the capability predicate against the main path's exact predicate rather than trusting the comment, and confirm the adapter is idempotent and returns the input array unchanged when nothing differs — that makes re-adaptation and caller-ordering safe by construction. ```json { "findings": [] } ```**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `adaptDocumentsForModel`
  - *How:* `packages/core/src/utils/document-blocks.ts`
  - *How:* `packages/core/src/core/next-steps-required.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:30:29.715Z; skill=chimera; applied=9; wins=9; skipped=42; skippedWins=42 -->
- **When reviewing a new SessionEvent rollout, grep the event literal (e.g. `enhance_usage`) repo-wide and confirm exactly one writer per surface and exactly one fold per consumer: type in `packages/core/src/types/session-events.ts`, writers (TUI `packages/tui/src/submit-prompt-refinement.ts`, webui-server `packages/webui-server/src/server/model-operations.ts`), folds (`session-summary-tracker.ts`, `session-store/summary-builder.ts`, `session-store/load-session-data.ts`). Inside a load path, check the full-replay branch and the legacy `else if` branch are mutually exclusive — two folds of the same event in one load path is the double-count defect; sibling writers on different surfaces are not.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `enhance_usage`
  - *How:* `packages/core/src/types/session-events.ts`
  - *How:* `packages/tui/src/submit-prompt-refinement.ts`
  - *How:* `packages/webui-server/src/server/model-operations.ts`
  - *How:* `session-summary-tracker.ts`
  - *How:* `session-store/summary-builder.ts`
  - *How:* `session-store/load-session-data.ts`
  - *How:* `else if`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-06T14:46:11.898Z; skipped=9; skippedWins=9 -->
- **Always verify a gitignore negation change against git's parent-exclusion rule by tracing the re-include idiom (`/*`, `!/foo/`, `/foo/*`, `!/foo/bar` in `packages/tools/src/codebase-index/gitignore.ts`): the ancestor check must evaluate parents with the full rule list so re-included directories stay traversable, while pure directory rules (`dist/` + `!dist/keep`) block re-inclusion. Prefer an exact-disagreement `toEqual` pin in the differential test over loose counts so any seventh behavioral flip fails loudly. ```json { "findings": [] } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `/*`
  - *How:* `!/foo/`
  - *How:* `/foo/*`
  - *How:* `!/foo/bar`
  - *How:* `packages/tools/src/codebase-index/gitignore.ts`
  - *How:* `dist/`
  - *How:* `!dist/keep`
  - *How:* `toEqual`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-06T14:36:28.645Z; skill=chimera; skipped=11; skippedWins=11 -->
- **When a new dead-code rollback test calls `undoDeadCodeFix(root, res.backupId!)` after `applyDeadCodeFixes` returned `rolledBack: true`, while a sibling test asserts `listDeadCodeBackups(root)` returns to baseline after clean rollback — the two assertions jointly pin *conditional* backup retention in `packages/tools/src/dead-code/fix.ts`. Resolve that retention branch (apply/rollback/undo region, second half of the file) before crediting or rejecting the test; the test itself cannot reveal which branch exists. ```json { "findings": [] } ```**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `undoDeadCodeFix(root, res.backupId!)`
  - *How:* `applyDeadCodeFixes`
  - *How:* `rolledBack: true`
  - *How:* `listDeadCodeBackups(root)`
  - *How:* `packages/tools/src/dead-code/fix.ts`
  - *How:* `json { "findings": [] }`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-06T13:46:20.913Z; skill=testing; applied=5; wins=5; skipped=18; skippedWins=18 -->
- **When reviewing dead-code tests in `packages/tools/tests/dead-code-engine.test.ts` that pass both `verify: 'none'` and `verifyCommand` to `applyDeadCodeFixes`, verify the apply-time gate in `packages/tools/src/dead-code/fix.ts` actually runs extra commands when the typecheck mode is `'none'` (the `verifyCommand` doc says "after the typecheck") before crediting the test — a mode-gated skip would make `rolledBack` untestable.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/tools/tests/dead-code-engine.test.ts`
  - *How:* `verify: 'none'`
  - *How:* `verifyCommand`
  - *How:* `applyDeadCodeFixes`
  - *How:* `packages/tools/src/dead-code/fix.ts`
  - *How:* `'none'`
  - *How:* `rolledBack`

---
*Last capture: 2026-10-06T15:23:05.448Z · 11 entries*
