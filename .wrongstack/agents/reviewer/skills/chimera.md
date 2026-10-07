## Contracts

- When a consumer reads `spec.model ?? fallback`, verify the producer normalizes blank strings to `undefined` (trim + `|| undefined`, as in `resolveRefinerTargetSpecs`, `packages/core/src/execution/refiner-target.ts`); `??` passes empty strings, so an un-normalized producer ships empty model ids.
- In never-throws provider wrappers, confirm `onError` observers are try/catch-wrapped inside the notify path; an unwrapped observer throw escapes the contract or re-enters the catch and double-notifies as `provider_error`.

## SessionEvent rollouts

- For a new event literal (e.g. `enhance_usage`), grep it repo-wide and require exactly one writer per surface and one fold per consumer: type in `packages/core/src/types/session-events.ts`; writers `packages/tui/src/submit-prompt-refinement.ts` (TUI) and `packages/webui-server/src/server/model-operations.ts` (webui-server); folds `session-summary-tracker.ts`, `session-store/summary-builder.ts`, `session-store/load-session-data.ts`.
- In a load path, verify the full-replay and legacy `else if` branches are mutually exclusive; two folds of one event in one load path is the double-count defect, sibling writers on different surfaces are not.

## Cross-package imports

- Before crediting a call site on a new subpath import (e.g. `treeKill` from `@wrongstack/core/utils/tree-kill`), read the source module's exported signature and the subpath entry in `packages/core/package.json` `exports`; if force-concluded before that read, name the unread anchor in remaining work instead of issuing an unqualified clean verdict.

## Manifests and syntax rewrites

- Treat `pnpm-workspace.yaml` `overrides:` as the authoritative override surface — top-level `overrides` in root `package.json` is inert under pnpm (which reads `pnpm.overrides` or the workspace yaml). When a diff raises an override floor to a same-day release, require a matching `minimumReleaseAgeExclude` under `minimumReleaseAge`; a fresh floor without one breaks `pnpm install` resolution.
- When a diff rewrites one syntax into another, check the consuming parser's grammar (quote handling, comment stripping, bracket depth), not the happy-path key: `splitTableFormDependency` (`packages/techstack/src/adapters/rust.ts`) emits `"key" = { … }` from `[section.key]` safely only because `parseTomlKeyValue` (`packages/techstack/src/adapters/parse-utils.ts`) strips quoted keys.

## Unproven checks

- When a side-request copies the main path's per-provider adaptation (`adaptDocumentsForModel`, `packages/core/src/utils/document-blocks.ts`, used by `packages/core/src/core/next-steps-required.ts`), compare its capability predicate to the main path's exact predicate — not the comment — and confirm the adapter is idempotent, returning the input unchanged when nothing differs.
- When a rollback test calls `undoDeadCodeFix(root, res.backupId!)` after `applyDeadCodeFixes` returned `rolledBack: true` and a sibling asserts `listDeadCodeBackups(root)` back to baseline, the pair pins conditional backup retention in `packages/tools/src/dead-code/fix.ts` (apply/rollback/undo region, second half): resolve that branch before crediting or rejecting — the tests alone cannot reveal it.
