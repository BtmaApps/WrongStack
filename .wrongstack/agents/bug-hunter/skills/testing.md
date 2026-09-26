## Adjudicating Chimera “broken test” findings

- Execute the flagged test file before reading the production branch it cites (`pnpm exec vitest run <file>`, e.g. `pnpm exec vitest run packages/core/tests/core/agent-malformed-retry.test.ts`). A green run instantly falsifies the reviewer’s claim about the error-text contract and prevents weakening a passing test’s assertions. Record the green run as `verification_evidence` (tests command + `exitCode`).
- In `packages/core/src/core/agent-loop.ts`, treat `foldBlockIntoConversation` as the sanctioned pattern for ALL runtime-injected context (`btw`/session/mailbox/steer/pulse/coach). Token-anchor bookkeeping is invalidated and recalibrated around it via `clearEvaluatedMailboxBlocks`, so findings that “folding mutates user input and corrupts calibration” are false positives unless a failing test shows the recalibration path is missing.

## SQLite migration coverage

- Build the N-1 fixture with raw `loadRuntimeDatabaseSync()` DDL at a `mkdtempSync` path, then set the version row to the old `SCHEMA_VERSION`. A fresh-install fixture never reaches the upgrade branch; this is the only shape that does.
- Reopen the temp path through the real store constructor, not the raw loader, and assert both halves: the previously-throwing writer succeeds and the version row advanced to the current `SCHEMA_VERSION`. One-sided assertions can pass even when the migration no-ops.
- Keep migration cases in `packages/techstack/tests/store/` beside `store-roundtrip.test.ts`, and remove each `mkdtempSync` directory at the end of the case.

## Verification commands

- Typecheck: `node node_modules/typescript/bin/tsc --noEmit --pretty false -p packages/techstack/tsconfig.json`
- Lint touched files only, not the whole package: `pnpm exec biome check packages/techstack/src/store/schema.ts packages/techstack/tests/store/store-roundtrip.test.ts`
- Run the store directory so sibling tests catch schema regressions: `pnpm exec vitest run packages/techstack/tests/store`

## Pitfalls

- `packages/techstack/src/store/schema.ts` is the source of truth for `SCHEMA_VERSION`; never hard-code the version number in a migration test.
