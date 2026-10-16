## Proof runs

- Run `tree .temp_files/proof-driven-bug-hunter/<round>/` and read that round’s `vitest.proof.config.mjs` before predicting its proof filename, environment, or invocation. Treat the `include` glob as filename-defining; `environment: 'node'` plus any comment requiring an in-file jsdom pragma is a fixed contract. If `run.mjs` exists, use the scripted runner; otherwise use `pnpm exec vitest run -c vitest.proof.config.mjs`. Root `vitest.config.ts` excludes `**/.temp_files/**`, so do not assume the shared runner discovers proofs.
- Preserve `root: here`, `.replace(/\\/g, '/')`, and the absolute `include` in `vitest.proof.config.mjs`; on Windows, removing any one can resolve against `process.cwd()` or retain backslashes and silently collect zero tests.

## Cleanup verification

- Treat a zero-result glob under `.temp_files/**` as inconclusive because ignore rules suppress traversal. Before reporting a “clean up round dir” deletion scope, inspect `.temp_files/proof-driven-bug-hunter/<round>/` with `tree` and confirm no nested `node_modules` junctions remain.

## Evidence hygiene

- Before reporting zero consumers for a dependency, rerun the exact repo-wide grep as the final step. Concurrent edits may change `pnpm-lock.yaml` or manifests such as `packages/webui-hq/package.json`; do not diagnose a changed result as tool failure.

## Test discovery

- Declare `packages/plugins/tests/*.test.ts` orphaned only after checking `packages/plugins/vitest.config.ts`, root `vitest.config.ts`, `pnpm check:test-types`, and `docs/reports/architecture-health-current.json`.
- Exercise `@wrongstack/tools` and `@wrongstack/providers` through their `scripts.test`: `vitest run --root ../.. packages/tools/tests` and `vitest run --root ../.. packages/providers/tests`.

## ESM contracts

- Read `packages/webui-server/tests/host-dispatcher-parity.test.ts` before editing `route-family-dispatcher.ts`; `balancedBlockAfter` depends on the raw `createRouteFamilyDispatcher(` formatting.
- Verify consumers of `packages/core/src/types/spec.ts` under both `./spec.js` and `@wrongstack/core/types/spec.js`.
