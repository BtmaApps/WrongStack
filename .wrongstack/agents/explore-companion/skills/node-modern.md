## Proof runs — `[applied 14×, 14 ok]`

- `tree` `.temp_files/proof-driven-bug-hunter/<round>/` before predicting how its proof runs: `run.mjs` present → scripted runner; absent → run `pnpm exec vitest run -c vitest.proof.config.mjs` yourself. Root `vitest.config.ts` excludes `**/.temp_files/**` — never assume a shared runner.
- Treat `root: here`, `.replace(/\\/g, '/')`, and absolute `include` in `vitest.proof.config.mjs` as load-bearing on Windows: drop any one and Vitest resolves against `process.cwd()`/backslashes, silently collecting 0 tests instead of erroring.

## Evidence hygiene — `[applied 2×, 2 ok]`

- Re-run the exact repo-wide grep as the final step before reporting a zero-consumer dependency: sessions live-edit the tree (`pnpm-lock.yaml` and `packages/webui-hq/package.json` both dropped `@radix-ui/react-select` between rounds). A first-round hit that later reads zero is concurrent editing, not tool failure.
- Claim ENOENT on an ignored `.temp_files/` artifact only after `tree`-ing that exact directory with `truncated=false`.

## Test discovery

- Declare a `packages/plugins/tests/*.test.ts` file orphaned only after checking `packages/plugins/vitest.config.ts`, root `vitest.config.ts`, `pnpm check:test-types`, and `docs/reports/architecture-health-current.json`.
- Drive `@wrongstack/tools` and `@wrongstack/providers` through their `scripts.test`: `vitest run --root ../.. packages/tools/tests`, likewise `packages/providers/tests`.

## ESM contracts

- Read `packages/webui-server/tests/host-dispatcher-parity.test.ts` before editing `route-family-dispatcher.ts`: `balancedBlockAfter` depends on the raw `createRouteFamilyDispatcher(` formatting.
- Verify `packages/core/src/types/spec.ts` consumers close under both `./spec.js` and `@wrongstack/core/types/spec.js`.
