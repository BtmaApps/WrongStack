## Value contracts

- When a consumer reads `spec.model ?? fallback`, verify the producer normalizes blanks to `undefined` (trim + `|| undefined`, as in `resolveRefinerTargetSpecs`, `packages/core/src/execution/refiner-target.ts`): `??` misses `""`, so an un-normalized producer ships empty model ids past the fallback.
- In never-throws provider wrappers, require `onError` try/catch-wrapped inside the notify path — an unwrapped observer throw escapes the contract or re-enters the catch and double-notifies as `provider_error`.

## SessionEvent rollouts

- For a new event literal (e.g. `enhance_usage`), grep repo-wide and require one writer per surface, one fold per consumer: type `packages/core/src/types/session-events.ts`; writers `packages/tui/src/submit-prompt-refinement.ts` (TUI), `packages/webui-server/src/server/model-operations.ts` (webui-server); folds `session-summary-tracker.ts`, `session-store/summary-builder.ts`, `session-store/load-session-data.ts`.
- In a load path, full-replay and legacy `else if` branches must be mutually exclusive — two folds of one event in one load path double-counts; sibling writers on different surfaces do not.

## Check the real surface before crediting

- Before crediting a new subpath import (e.g. `treeKill` from `@wrongstack/core/utils/tree-kill`), read the source module's exported signature and the `exports` entry in `packages/core/package.json`; if force-concluded before that read, name the unread anchor in remaining work — never an unqualified clean verdict.
- When a diff rewrites one syntax into another, vet the consuming parser's grammar (quote handling, comment stripping, bracket depth), not the happy-path key — `splitTableFormDependency` (`packages/techstack/src/adapters/rust.ts`) emits `"key" = { … }` from `[section.key]` safely only because `parseTomlKeyValue` (`packages/techstack/src/adapters/parse-utils.ts`) strips quoted keys.

## pnpm overrides

- Treat `pnpm-workspace.yaml` `overrides:` as the authoritative override surface; top-level `overrides` in root `package.json` is npm's mechanism, inert under pnpm (which reads `pnpm.overrides` or the workspace yaml). A floor raised to a same-day release needs a matching `minimumReleaseAgeExclude` under `minimumReleaseAge`, else `pnpm install` fails version resolution.

## Unproven (sound; apply exactly as stated)

- When a side-request copies a main-path adaptation (`adaptDocumentsForModel`, `packages/core/src/utils/document-blocks.ts`, used by `packages/core/src/core/next-steps-required.ts`), compare its capability predicate to the main path's exact predicate, not the comment, and require idempotence — the input array returned unchanged when nothing differs.
- A rollback test calling `undoDeadCodeFix(root, res.backupId!)` after `applyDeadCodeFixes` returned `rolledBack: true`, plus a sibling asserting `listDeadCodeBackups(root)` returns to baseline, pins conditional backup retention in `packages/tools/src/dead-code/fix.ts` (second half, apply/rollback/undo region): resolve that branch in source before crediting or rejecting — the tests cannot reveal it.
