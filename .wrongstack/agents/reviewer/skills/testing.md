# Testing Addendum — Reviewer Agent

## Transition Tests
- Before scanning transitions with `for (let i = 1; ...)`, seed every scatter-detection `seen`-set with the first element. In `packages/tui/tests/theme-presets.test.ts`, initialize `seen` with `THEME_OPTIONS[0].family` before checking `seen.has(family)`; otherwise the first family group is unguarded. Apply this rule to every transition-based “no repeats” invariant.

## Import Resolution
- Verify `@wrongstack/<pkg>` imports through the package-root barrel `packages/<pkg>/src/index.ts`, not only the defining module. For example, confirm `packages/persistence/src/index.ts` re-exports `./sqlite-runtime.js`, exposing `loadRuntimeDatabaseSync` from `packages/persistence/src/sqlite-runtime.ts`.
- Confirm both the barrel re-export and the consuming package’s `@wrongstack/<pkg>` declaration in `package.json`; repository-relative path resolution does not excuse an undeclared dependency.

## Migration Fixtures
- Make hand-built legacy-schema SQLite fixtures match the production migration source exactly, especially `techstack_schema_version` and the `jobs` table and column definitions.

## Diff Verification
- Re-resolve imports, types, and call sites against live files with `read`/`grep` before reporting defects; treat the diff as untrusted.
- Check stale identifiers against current code: `fuseRanked` may be `reciprocalRankFusion`, while `VectorResult` may instead be the return type of `cosineSimilarity` or `reciprocalRankFusion`.
- Anchor confirmed findings at `file:line` using the exact identifier.

## Concurrency
- In `packages/tools/src/codebase-index/indexer.ts`, do not mutate shared arrays, maps, or strings inside callbacks passed to `Promise.allSettled(batchFiles.map(async ...))`; interleaved awaits can race writers or duplicate or drop data.
- Complete parallel reads, merge results, perform one batched embedding/index delegation, and reconcile by file id. Report each shared-mutation pattern once.
