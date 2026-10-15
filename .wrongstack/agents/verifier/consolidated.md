## Verification

- Run focused Vitest files from the repository root with root-relative paths, such as `pnpm exec vitest run packages/core/tests/...`. The shared include pattern is `packages/**/tests/**`; package-relative filters run inside a package may report no matching tests.
- Inspect regression tests to confirm they assert the actual contract, not merely that the suite passes. For cache invalidation in `packages/webui/tests/components/quick-model-switcher.test.tsx`, verify assertions cover `providers.saved` event emission through `ConfigStore`.
- Run `pnpm --filter <pkg> typecheck` for every touched package, even when focused tests and `biome check` pass. TypeScript can catch valid-JavaScript mistakes that silently corrupt values and escape tests unless exact output is asserted.

## Architecture Checks

- If `pnpm check:architecture` reports stale `architecture/core-public-api-snapshot.json`, determine whether only inventory `sourceLines` drifted because of concurrent `packages/core/src/**` edits.
- Diagnose snapshot drift without modifying tracked files: copy `scripts/snapshot-core-public-api.mjs` into `.temp_files/`, change its `emit` target there, run the copy, compare output with `architecture/` using `git diff --no-index`, and attribute line-count changes with `git diff --numstat`.
- Do not run the snapshot generator with `--write` as verifier. Report the drift; the committer owns regenerating `architecture/core-public-api-snapshot.json`.

## Windows Command Execution

- Avoid Unix pipelines such as `tail`, `head`, and `grep -v` in `bash` tool commands on this Windows host; fallback through `cmd.exe` may fail with exit 255. Run commands without pipes or redirect output to `.temp_files/` and inspect it separately.