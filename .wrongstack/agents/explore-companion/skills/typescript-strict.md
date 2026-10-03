## Type-check gates

- Do not infer exclusion from `pnpm check:test_types` because a package name is absent from `scripts/check-test-typecheck.mjs`; `discoverProjects()` generically scans workspace packages. Prove inclusion with `glob "packages/<pkg>/tsconfig*.json"`, `tsconfig.test.json`, and `*.test.ts` files under `tests/`. Treat potentially diagnostic edits as changes to the `architecture/test-typecheck-baseline` ratchet used by `release:check`.
- For `packages/simpleui`, use `packages/simpleui/vite.config.ts` (`test: { maxWorkers }` and the react plugin), not a nonexistent `vitest.config.ts`. Preserve `// @vitest-environment jsdom` in `packages/simpleui/tests/**`, or `document` may fail under Node. Before assessing blast radius, check both `typecheck` (`tsc --noEmit` via `tsconfig.json`, which excludes `tests`) and `tsconfig.test.json` (`tests/**/*`), which `scripts/check-test-typecheck.mjs` executes through `pnpm check-test-types`.

## Reference resolution

- Do not use content-mode grep counts to declare an import unused. If `outdatedTool` appears textually unreferenced, range-read `packages/tools/src/builtin.ts` around aggregations such as `OPTIONAL_TOOLS` and `...browserTools` before concluding anything.

## TS config blast radius

- For `tsconfig.base.json` edits, enumerate `extends` with repo-wide `rg 'tsconfig\.base\.json'`; call graphs cannot trace JSON references.
- Inspect `packages/webui/tsconfig.json`, `packages/simpleui/tsconfig.json`, and `packages/webui-hq/tsconfig.json`; they inline safety flags because bundler/JSX resolution blocks `extends`.
- Treat `packages/tools/src/typecheck.ts` matches as filename-discovery candidates, not option consumers.

## Run evidence

- Read `.wrongstack/AGENTS.md` before treating empty `rg`/glob results under ignored `.wrongstack/` paths, including `project-kit-runs`, as evidence of absence.
- For `project_kit_run`, obtain error text from `project-kit.ts` `execute` via `JSON.stringify(result)`; reserve `record.json` for `status`, `durationMs`, and `runId`.

## TS traps

- Keep `packages/tui/tests/key-handler-replay-corpus.test.ts` with `tests/__snapshots__/key-handler-replay-corpus.test.ts.snap`; account for `as never as Parameters<typeof createAppKeyHandler>[0]` and compare snapshots/runtime call order with `packages/tui/src/key-routes/key-route-composer.ts` and `key-route-pointer.ts`.
- For common names such as `create`, use receiver-scoped `(sessionStore|store)\.create\(` over `packages/**/src`, excluding tests; use `codebase-incoming-calls` only for distinctive names because its `file` filter cannot distinguish same-named methods.

- Never conclude a package is excluded from `pnpm check:test_types` from a zero-hit grep of its name in `scripts/check-test-typecheck.mjs` — `discoverProjects()` (lines ~37–66) scans every workspace package directory generically for a `tsconfig.test.json` plus a `tests/` dir containing `*.test.ts`; package names are never hardcoded. Prove participation with a `glob "packages/<pkg>/tsconfig*.json"` for the config and a check that `tests/` has test files, and treat any edit that could introduce new test-type diagnostics as tripping the `architecture/test-typecheck-baseline` ratchet wired into `release:check`. (anchors: `pnpm check:test_types`, `scripts/check-test-typecheck.mjs`, `discoverProjects()`, `tsconfig.test.json`, `tests/`, `*.test.ts`, `glob "packages/<pkg>/tsconfig*.json"`, `architecture/test-typecheck-baseline`, `release:check`) [applied 12×, 12 ok]
- Never trust a content-mode grep's per-file match count as proof a symbol is referenced only at its import line — in `packages/tools/src/builtin.ts` the count reported a single `outdatedTool` occurrence (the import at ) while a direct read revealed the registration at . When a named import appears textually unreferenced in a strict-TS repo, resolve the anomaly with a range read of the aggregation site (arrays like `OPTIONAL_TOOLS`, spreads like `...browserTools`) before reporting an unused import. (anchors: `packages/tools/src/builtin.ts`, `outdatedTool`, `OPTIONAL_TOOLS`, `...browserTools`) [applied 2×, 2 ok]
- Always treat `packages/simpleui` vitest configuration as living in `packages/simpleui/vite.config.ts` (`test: { maxWorkers }` + react plugin) — there is no `vitest.config.ts` in that package, and per-file `// @vitest-environment jsdom` docblocks in `packages/simpleui/tests/**` are the sole jsdom selector for most suites, so removing a docblock line silently drops the suite to a node environment that fails on `document`. Before predicting blast radius of editing a `packages/simpleui` test file, check both type gates: the package `typecheck` script (`tsc --noEmit`) uses `tsconfig.json`, which excludes `tests`, while `tsconfig.test.json` (includes `tests/**/*`) is executed repo-wide by `scripts/check-test-typecheck.mjs` via `pnpm check:test-types` — a baseline ratchet that fails on new or increased diagnostics and is wired into `release:check`. (anchors: `packages/simpleui`, `packages/simpleui/vite.config.ts`, `test: { maxWorkers }`, `vitest.config.ts`, `// @vitest-environment jsdom`, `packages/simpleui/tests/**`, `document`, `typecheck`, `tsc --noEmit`, `tsconfig.json`, `tests`, `tsconfig.test.json`, `tests/**/*`, `scripts/check-test-typecheck.mjs`, `pnpm check:test-types`, `release:check`) [applied 3×, 3 ok]

---
*Distilled 2026-10-01T22:16:51.135Z · 3 new directives*
