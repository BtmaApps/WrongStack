## Proof runs

- Inspect `.temp_files/proof-driven-bug-hunter/<round>/` with `tree` and read `vitest.proof.config.mjs` before choosing proof filenames or invocation. Honor its `include`, `environment: 'node'`, and any required in-file jsdom pragma. Use `run.mjs` when present; otherwise use `pnpm exec vitest run -c vitest.proof.config.mjs`. Root `vitest.config.ts` excludes `**/.temp_files/**`.
- Preserve `root: here`, `.replace(/\\/g, '/')`, and absolute `include` paths in `vitest.proof.config.mjs`; removing them can silently collect zero tests on Windows.
- Read the tail of direct-run scripts under `.temp_files/**` before interpreting exit status. Check whether errors set `process.exitCode=1`, as in `desktop-focus-fix/verify.mjs:185`, or leave status zero; inspect `evidence/results.json` for durable pass/fail evidence. Before advising a non-root rerun, check for `process.cwd()`-rooted paths and a pinned `node_modules/.bun/electron@<ver>+<hash>` executable.

## Discovery and verification

- Treat zero-result globs under `.temp_files/**` as inconclusive: ignore rules can suppress traversal. Before defining cleanup scope, inspect `.temp_files/proof-driven-bug-hunter/<round>/` with `tree` and confirm no nested `node_modules` junctions remain.
- Before reporting zero dependency consumers, rerun the exact repo-wide grep as the final check; concurrent edits to `pnpm-lock.yaml` or manifests such as `packages/webui-hq/package.json` can change results.
- Declare `packages/plugins/tests/*.test.ts` orphaned only after checking `packages/plugins/vitest.config.ts`, root `vitest.config.ts`, `pnpm check:test-types`, and `docs/reports/architecture-health-current.json`.
- Test `@wrongstack/tools` and `@wrongstack/providers` through their `scripts.test`: `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.

## Source contracts

- Read `packages/webui-server/tests/host-dispatcher-parity.test.ts` before editing `route-family-dispatcher.ts`; its `balancedBlockAfter` helper depends on raw `createRouteFamilyDispatcher(` formatting.
- Check consumers of `packages/core/src/types/spec.ts` through both `./spec.js` and `@wrongstack/core/types/spec.js`.
