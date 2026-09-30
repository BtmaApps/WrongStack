## Architecture baselines

- From the repository root, search each `architecture/*.json` leaf by exact text, such as `rg -n -F 'test-only-exports.json'`; repeat for every leaf and never substitute import/call-graph tools. Pair the search with root `package.json` scripts `check:architecture`, `check:architecture:sync`, and `report:architecture`. Inspect runtime `fs` reads in `scripts/lib/architecture-health.mjs` (`loadArchitectureInputs`) and `scripts/check-*.mjs`, plus sync rewrite flags such as `--write-hotspot-baseline`; use a zero-hit `vitest.scripts.config.ts` search as confirmation that the gate is npm-scripts-only.

## WebUI test routing

- Run `cd packages/webui && npx vitest run <file>`; do not use root `vitest run` for WebUI because it excludes `packages/webui/**`.
- In `packages/webui/vitest.config.ts`, route `tests/server/**` to `server-node` and all other suites, including `tests/components/**`, to `browser-jsdom`; preserve the Node/jsdom environments, globals, 30s timeouts, `setupFiles: tests/setup/i18n-deferred.ts`, and repeated `@wrongstack/*` aliases. Cite the selected Vitest project. Keep server tests in Node because `@wrongstack/governance` uses `node:sqlite`, which Vite’s jsdom bundler rejects on Linux CI. Do not assume inline projects inherit root `resolve`/`ssr`.

## Consumer mapping

- Trace `packages/sdd/src/spec-store.ts` through the `@wrongstack/sdd` barrel at `packages/sdd/src/index.ts:43` (`SpecStore`, `SpecStoreOptions`, `SpecIndexEntry`); do not stop at a zero-hit deep `spec-store` search, and search `new SpecStore(` with `path=packages`. Check `packages/webui-server/src/server/specs-ws-handler.ts`, `sdd-wizard-wiring.ts`, and `packages/cli/src/slash-commands/sdd.ts`; exclude type-only `spec-builder.ts` and `sdd-interview-driver.ts` from value-consumer counts.

## Focused probes

- Without `packages/<pkg>/vitest*.ts`, run `npx vitest run packages/tools/tests/<file>.test.ts`; account for `packages/**/tests/**/*.test.{ts,tsx}` and `perFile: false`.
- Run `packages/cli/tests/hq-dashboard.test.ts` with `pnpm --filter @wrongstack/cli test:hqdash`; save output under `.reports/release-check-matrix/*.log`.
- Before executing `.temp_files/*.cjs`, inspect writes to `review-reports.jsonl`, `review-findings.jsonl`, and `.review-store-maintenance.json`; avoid repeated `fs.appendFileSync`. Resolve `vite` and `@playwright/test` with `createRequire` against `packages/webui/package.json`.
