## Proven — apply first

- For any `packages/plugins/tests/*.test.ts` blast radius, check both collectors before predicting gates: `packages/plugins/vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `globals: false`, coverage thresholds 94/95/91/79 over `src/**`) and root `vitest.config.ts` `packages/**/tests/**`, plus `packages/plugins/tsconfig.test.json` (`tests/**/*`) behind `pnpm check:test-types`. Corroborate with one grep of the `projects` array in `docs/reports/architecture-health-current.json` (e.g. `"root-node"`).
- Before touching `packages/webui-server/src/server/route-family-dispatcher.ts` or its call sites, read `packages/webui-server/tests/host-dispatcher-parity.test.ts`: it extracts the `createRouteFamilyDispatcher(` options block from raw source (`balancedBlockAfter`), so reformatting the call in `message-dispatcher.ts` or `embedded-message-router.ts` fails the contract with zero runtime change.
- Closing consumers of `packages/core/src/types/spec.ts`: grep both specifier forms — sibling `from './spec.js'` and repo-wide `@wrongstack/core/types/spec.js` — and read the `exports` map in `packages/core/package.json` for `types/spec` and wildcards (`\.\*`). With only explicit entries (`./types`, `./types/limits`), package-specifier imports resolve solely via `scripts/vitest-core-aliases.mjs` and fail plain Node ESM — report an exposure anomaly, not a working path.

## Proof-round gates

- When mapping a `.temp_files/proof-driven-bug-hunter/<round>/` blast radius, read sibling `run.mjs` before predicting gates — it is the sole invoker of `vitest.proof.config.mjs`. It hardcodes the repo-root-relative `--config` path (any round-dir or config rename breaks it) and spawns `<repo-root>/node_modules/vitest/vitest.mjs` with `cwd: process.cwd()`, so the round runs only when invoked from the repo root; exit code and tee'd output land in sibling `proof.before.log`. Root `test.exclude` is only `'**/.temp_files/**'` and coverage `include` is `packages/*/src/**`, so explicit `vitest run <path>` will not collect these tests and they never move coverage. Tracked-code grep for the config name returns zero by design (`.temp_files/` is gitignored). Do not enumerate configs with nested-brace globs — `vitest.*.{ts,mts,js,mjs,json}` returns 0 files; grep content or read exact names.

## Mocks and per-package gates

- Judge `packages/webui-server` by its own `vitest.config.ts` (one project, `environment: 'node'`, thresholds 76/69/66), never the `packages/webui` split. Its `test` script runs from the package directory, so evaluate `path.resolve('packages', ...)` assertions under both CWDs and state which reading makes a guard pass trivially or self-skip.
- In `start-http-server-allowed-hostnames.test.ts`, `vi.mock('<specifier>', importOriginal => ({...spread, overridden}))` must match exactly the specifier imported by `import('../src/server/server-runtime.js')` — a mismatch lets the real server bind port 3456.

## Evidence and workspace closure

- Zero hits never prove absence. In gitignored `.temp_files/`, prove existence with a direct `read`; claim ENOENT only from exact-directory `tree` (`truncated=false`). On a repo-wide `grep` timeout, don't retry — narrow to `scripts/` and root `package.json`, and label full-tree closure unverified.
- Read workspace membership from `pnpm-workspace.yaml`, never a root `workspaces` field. Classify script access before tracing root-manifest impact: `scripts/bump-version.mjs` writes only `version`; `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs` read content.

## Retired — do not reinstate

- Do not assume `packages/governance/src/index.ts` is uniformly an explicit-named-re-export barrel: it mixes styles — `runtime-compatibility.js` is a hand-maintained named list, but `protocol-decoder.js` is re-exported via `export * from './protocol-decoder.js'` (index.ts:33). Before claiming a governance export is package-private or public, grep `packages/governance/src/index.ts` for the specific module stem and read the matching re-export form; new exports from `export *` modules become public automatically, while named-list modules stay private until listed. Establish real consumers with a repo-root `files_with_matches` symbol grep (close any truncated content-grep with it before reporting zero external importers).
