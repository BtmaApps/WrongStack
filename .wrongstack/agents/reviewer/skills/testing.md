# Testing Addendum — Reviewer Agent

## Data-Retention Changes
- Whenever a retention or eviction default flips from retain-forever to bounded, grep test files for the new option/constant identifiers (e.g. `nonTerminalMaxAgeMs`, `REVIEW_STORE_NON_TERMINAL_RETENTION_MS` in `packages/core/src/plugins/review-store-maintenance.ts`). Require tests pinning all three behaviors before approving — kept under cap, evicted over cap, and the disable sentinel `Number.POSITIVE_INFINITY`. Data-deletion regressions produce no failing signal otherwise.

## Diff Verification
- Treat the diff as untrusted: re-resolve imports, types, and call sites against live files with `read`/`grep` before reporting defects. Identifiers may have been renamed (`fuseRanked` → `reciprocalRankFusion`; `VectorResult` may now be the return type of `cosineSimilarity` or `reciprocalRankFusion`).
- Anchor every confirmed finding at `file:line` using the exact identifier.

## Import Resolution
- Verify `@wrongstack/<pkg>` imports resolve through the package barrel `packages/<pkg>/src/index.ts`, not just the defining module — e.g. confirm `packages/persistence/src/index.ts` re-exports `./sqlite-runtime.js`, exposing `loadRuntimeDatabaseSync` from `packages/persistence/src/sqlite-runtime.ts` — and confirm the consuming package declares the dependency in its `package.json`. Repository-relative path resolution does not excuse an undeclared dependency.

## Concurrency
- In `packages/tools/src/codebase-index/indexer.ts`, flag any mutation of shared arrays, maps, or strings inside callbacks passed to `Promise.allSettled(batchFiles.map(async ...))`: interleaved awaits can race writers, duplicating or dropping data. Expect parallel reads, a single merged batched embedding/index delegation, and reconciliation by file id. Report each shared-mutation pattern once.

## Test Fixtures and Invariants
- Require hand-built legacy-schema SQLite fixtures to match the production migration source exactly — especially `techstack_schema_version` and the `jobs` table and column definitions.
- In transition-based "no repeats" invariants (`for (let i = 1; ...)`), require the `seen` set to be seeded with the first element — e.g. `seen` initialized with `THEME_OPTIONS[0].family` in `packages/tui/tests/theme-presets.test.ts` — otherwise the first family group is unguarded.
