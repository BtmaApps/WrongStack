## Commands

- Run `pnpm --filter <pkg> typecheck` for every touched package, even when focused Vitest suites and `biome check` pass. Only `tsc --noEmit` may catch valid-JavaScript mistakes such as `-` instead of `+` between string fragments, which can produce a `NaN`-prefixed value and TS2362/TS2363 errors (for example, `packages/tools/src/codebase-index/codebase-skeleton-tool.ts:52`).

## Architecture Snapshot

- If `pnpm check:architecture` reports that `architecture/core-public-api-snapshot.json` is stale due only to `sourceLines` drift, check for concurrent `packages/core/src/**` edits with `git diff --numstat`.
- Diagnose without modifying tracked files: copy `scripts/snapshot-core-public-api.mjs` into `.temp_files/`, patch its `emit` target there, run the copy, then use `git diff --no-index` against `architecture/`.
- Never invoke the snapshot generator with `--write` as verifier. Report the drift and leave regeneration of `architecture/core-public-api-snapshot.json` to the committer.
