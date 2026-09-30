# explore-companion Role Instructions

## Result Submission

- Submit findings through `submit_result`; this role has no `mailbox` capability. Keep every field ASCII-only. If validation rejects a result, shorten the narrative and `files_examined` before removing evidence.
- Separate confirmed findings from inconclusive checks. A failed tool, ignored path, unavailable index, or unqualified zero-hit result does not prove absence.
- Re-read live targets before finalizing. State when concurrent edits or a missing baseline limit evidence to current post-edit state.

## Search and Evidence Discipline

- Read named files directly. Treat `codebase-skeleton` line ranges as approximate; pin declarations with exact `grep` or short reads and compare line totals across reads to detect drift.
- `glob` and `grep` honor ignore rules. In `.temp_files/`, `dist/`, `.wrongstack/`, and other ignored trees, use exact-directory `tree` plus direct reads; `codebase-search` results are non-evidence. An exact `tree` proves ignored-path presence.
- Prove a scratch path absent with a direct read, named and parent `tree` checks (`truncated=false`), a repo-wide stem `glob`, and a tracked-content stem `grep`. Report that trail; never reconstruct deleted content or consumers from a probe premise.
- Content grep shows at most three matches per file. Search exact symbols or call forms separately and validate important no-hits with a known positive. Recover elided reads by grepping `.wrongstack/tool-output/*.log` using its `N→content` prefixes and reported totals.
- Use call graphs only as corroboration. They can miss ignored files, writes, barrels, dynamic or type-only imports, and re-exports, and can truncate name collisions.
- Treat `git diff HEAD` as historical evidence only for tracked files. Gitignored scratch edits have no baseline.

## Consumer and Public-API Mapping

- Search the leaf specifier, exact symbol, relative and package forms, dynamic/type-only imports, package barrels, export maps, and manifests. Do not substitute a root package specifier for a subpath; classify comments, documentation, mirrors, and tests separately from production consumers.
- Treat a test file as an import leaf: use an exact-stem grep, then map dependents of the production module named in the test’s import block. Separate value imports from type-only imports.
- Read every intermediary barrel. `export *` exposes all current exports, while explicit lists require exact names. Pass-through re-exports are invisible to `symbol(` searches and become package-public only when an exported barrel reaches them.
- Check file-versus-directory resolution before interpreting an import: `packages/webui-server/src/server/http-server.ts` shadows `http-server/index.ts` for `./http-server.js`.
- Split same-named utilities by full import specifier and path. For example, `atomic-write.ts` in `packages/persistence/src/`, `packages/core/src/utils/`, and `packages/kanban/src/utils/` are distinct implementations or adapters; bare filename counts are misleading.
- When symbols overlap, use exact-symbol `codebase-incoming-calls` scoped with `file:` and grep the module leaf specifier; then confirm the public surface through the live package barrel.

## Test-File Blast Radius

- Read the full test and enumerate assertions, events, errors, platform gates, strict `fetch` stubs, and every symbol required by partial `vi.mock` factories.
- Resolve commands from live package scripts and Vitest configs. Packages without a local config, including `@wrongstack/tools`, use the root config through commands such as `vitest run --root ../.. packages/<pkg>/tests`.
- Read `coverage.include` and thresholds before predicting impact. Root `vitest.config.ts` covers `packages/*/src/**` with aggregate `perFile: false` thresholds, so assertion deletion in any covered package suite can move the root gate.
- Search the test stem, sibling tests, snapshots, and subject module. If an imported symbol occurs only on its import line in a test, treat the documented assertion or contract as deleted; check `architecture/test-only-exports.json` before declaring the seam dead.
- WebUI `tests/server/**` uses the `server-node` project; component and other client suites use `browser-jsdom` with `tests/setup/i18n-deferred.ts`. Import component-test `waitFor` and `act` explicitly from `@testing-library/react`.

## Proof Rounds and Scratch Artifacts

- Verify `.temp_files/proof-driven-bug-hunter/<round>/` with an exact-directory `tree` before probing. Dated rounds may already be torn down; report premise failure instead of inferring their former contents.
- Derive the runner from the live round tree, never memory. Config names drift among `vitest.proof.config.mjs`, `vitest.probe.config.mjs`, and `vitest.proof.config.ts`; `--config` is filename-exact.
- Run `npx vitest run --config <round>/<exact-config>` from repository root. With `root: here`, `test.include` resolves against the config’s `root`, not the invocation CWD; inspect `repoRoot` and aliases too.
- Enumerate sibling `*.test.ts` files before interpreting `test.include`. A wildcard is multi-test; an exact stem must be checked against every sibling config when multiple configs exist.
- A config-only round has no test and fails with “No test files found.” A test-only round has no runner. Root gates exclude `**/.temp_files/**`, so scratch edits are gate-inert and git-invisible until a round-specific runner exists.
- For `make-*.mjs` generators, treat the written artifact as the consumer. Prove use through the config include and the test’s literal import block; compare header comments with the actual transform chain because ignored scratch has no `git diff HEAD` baseline.
- A bare proof or instrument script is a standalone exit-code or output harness, not automatically a Vitest test. Verify literal imports, stdout/subprocess consumers, and whether parsed output still matches the producer; treat files such as `red.txt` as captured artifacts that can desynchronize after edits.
- For blind test edits, read the current production target before predicting a mutant. Prefer running the round over inferring breakage from runtime-inert markers such as an unimported type annotation or `require()` in ESM. Flag hard-coded POSIX roots such as `path.resolve('/home/user/project')` as Windows-checkout divergence risks.

## Project Consumer Facts

- Architecture baselines under `architecture/*.json` are loaded through `fs` by `scripts/lib/architecture-health.mjs` and `scripts/check-*.mjs`, not ordinary imports. Pair exact leaf-filename searches with `check:architecture`, `check:architecture:sync`, and `report:architecture` in root `package.json`.
- A sibling `scripts/lib/<name>.d.mts` is an ambient typing surface, not a runtime consumer. Production consumers are generally `scripts/check-*.mjs`; script tests are selected by `vitest.scripts.config.ts`.
- `packages/core/src/quota/index.ts` is exposed through `@wrongstack/core/quota` and `./dist/quota/index.js`, not the root `@wrongstack/core` barrel. The WebUI provider-quota store is a type mirror/commented mention, not an importer.
- A package subpath plus an `export *` chain can make a symbol public even when `architecture/core-public-api-snapshot.json` omits it. That snapshot pins the explicit named list, not every subpath export; verify live `export *` chains and `packages/core/package.json` exports before claiming privacy.