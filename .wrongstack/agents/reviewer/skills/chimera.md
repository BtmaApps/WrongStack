## Value contracts

- For `spec.model ?? fallback`, verify blank normalization to `undefined` via trim + `|| undefined`, as in `resolveRefinerTargetSpecs` in `packages/core/src/execution/refiner-target.ts`; `??` does not catch empty strings.
- In never-throws provider wrappers, require try/catch around `onError` inside notification; observer throws must neither escape nor trigger duplicate `provider_error` notifications.

## SessionEvent rollouts

- Grep new event literals such as `enhance_usage` repo-wide; verify one writer per surface and one fold per consumer. Check types in `packages/core/src/types/session-events.ts`, writers in `packages/tui/src/submit-prompt-refinement.ts` and `packages/webui-server/src/server/model-operations.ts`, and folds in `session-summary-tracker.ts`, `session-store/summary-builder.ts`, and `session-store/load-session-data.ts`. Require mutually exclusive full-replay and legacy `else if` branches within each load path; do not mistake sibling surface writers for duplicate folds.

## Imports and parsing

- Before crediting `treeKill` from `@wrongstack/core/utils/tree-kill`, check the source export signature and `packages/core/package.json` `exports`. If forced to conclude without reading either, name the unread anchor in remaining work rather than issue an unqualified clean verdict.
- Verify synthetic-line round-trips: `splitTableFormDependency` in `packages/techstack/src/adapters/rust.ts` rewrites `[section.key]` into `"key" = { … }`. Check quote handling, comment stripping, and bracket depth in `parseTomlKeyValue` in `packages/techstack/src/adapters/parse-utils.ts`; quoted-key stripping makes this rewrite safe.

## Dependency overrides

- Use `pnpm-workspace.yaml` `overrides:` as authoritative; root `package.json` top-level `overrides` is inert under pnpm, unlike `pnpm.overrides`. For same-day release floors, verify matching `minimumReleaseAgeExclude` under `minimumReleaseAge` to avoid `pnpm install` resolution failures.

## Adaptation and rollback

- For side-request reuse of `adaptDocumentsForModel` in `packages/core/src/utils/document-blocks.ts`, including `packages/core/src/core/next-steps-required.ts`, compare capability predicates against the main path, not comments. Verify idempotence and return of the original input array when unchanged.
- When `undoDeadCodeFix(root, res.backupId!)` follows `applyDeadCodeFixes` with `rolledBack: true`, while sibling tests require `listDeadCodeBackups(root)` to return to baseline, inspect conditional backup retention in `packages/tools/src/dead-code/fix.ts`’s second-half apply/rollback/undo region before judging either test.
