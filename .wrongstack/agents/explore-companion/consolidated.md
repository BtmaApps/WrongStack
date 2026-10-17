# explore-companion Role Instructions

## Evidence and Reporting

- Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery; verify conclusions with direct reads of source, imports, re-exports, runtime wiring, configuration, and tests.
- Revalidate consumer and absence claims on every invocation. Concurrent edits, ignored paths, stale indexes, truncated output, and tool errors can invalidate earlier findings.
- Treat zero-hit searches as inconclusive until traversal is validated. If direct `read` returns ENOENT, run a positive-control glob on the containing directory, such as `packages/core/tests/*.test.ts`; ENOENT plus visible siblings establishes the target’s absence.
- Close exhaustive searches with `files_with_matches` and untruncated output. Distinguish runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation, and generated metadata.
- Submit findings through `submit_result`, always including `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Task Orientation

- Resolve task-named files using literal stems, exact filenames, labels, or distinctive runtime strings before mapping impact.
- For vague tasks without file hints, use an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**` to identify candidate production/test clusters, then inspect them with `codebase-skeleton`.
- When acceptance wording matters, read the owning `packages/core/skills/**/SKILL.md`.
- Inspect ignored scratch directories with direct `tree` and reads. A repo-wide `rg` normally respects `.gitignore`; zero matches do not close references inside `tmp/` or `.temp_files/`.

## Consumer and Public-API Closure

- Classify targets before tracing them: modules, suites, scripts, configuration, baselines, generated artifacts, and data require different evidence.
- Close module consumers with module-path and exported-symbol searches, covering aliases, relative imports, barrels, dynamic imports, tests, mocks, and non-TypeScript harnesses. Include optional `.js` suffixes where relevant.
- Never pass a filename stem to `codebase-impact-analysis` as though it were a symbol. Call-graph results alone do not establish consumer closure.
- Inspect actual barrel exports and `package.json` `exports` before claiming public availability; a facade file alone is insufficient.
- Match complete import specifiers and separate type-only imports from runtime edges. Exclude comments, lockfiles, generated indexes, duplicate names, and prefix collisions such as `@wrongstack/webui` versus `@wrongstack/webui-server`.
- Trace behavioral seams when imports are insufficient: environment variables, subprocess arguments, aliases, runtime strings, snapshots, and assertions.
- For `packages/core/src/utils/*`, search exported symbols repo-wide despite `codebase-incoming-calls`; inspect `utils/index.ts` and `architecture/core-public-api-snapshot.json` for barrel and API-ratchet impact.
- Treat `apps/desktop/src/main/validation/schemas.ts` separately from `index.ts`, which does not re-export it; trace direct imports with `validation/schemas(\.js)?["']`.
- Trace desktop main/preload entries through `scripts/build-package.mjs`, `apps/desktop/package.json`’s `"main"`, `runtime-manager-paths.ts`, and `contextBridge.exposeInMainWorld` names such as `wrongstackDesktop`; these are build/runtime entry points, not ordinary imported modules.
- For `node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>/`, use direct reads, `**/package.json`, and `bun.lock`, not index tools or reindexing; trace script callers through package `scripts`/`bin`, sibling launchers, then repository dependency declarations.

## Test Discovery and Architecture Constraints

- Check package-local `vitest.config.ts` before predicting collection. `packages/core` has none; its suites follow the root `vitest.config.ts` `include` contract.
- Root Vitest discovery covers `packages/**` and `apps/**`, not scratch tests under `tmp/`. `bun run test` with an explicit scratch path still collects zero tests and exits 1; use a dedicated config, an appropriate `--dir tmp` invocation, or `bun test`.
- Treat suites as test-runner inputs rather than exported modules. Determine dependents using test-stem searches and runner `include` globs, and trace their production imports separately.
- Check `architecture/*.json` and `docs/reports/architecture-health-current.json` for path-based ratchets, including `architecture/test-only-exports.json`; distinguish these constraints from code consumers.
- Treat version pins such as `.bun-version` as data: read directly and search both filename and literal value.

## Scratch Proofs and Verification Harnesses

- Begin scratch-proof inspection with direct `tree`, especially under `.temp_files/proof-driven-bug-hunter/`. Determine the runner from actual scripts and configs; a lone `proof.ts` does not establish a configured test suite.
- Read harness `catch`, `finally`, and script tails before interpreting exit codes. Some scripts swallow assertions into `evidence/results.json` and exit 0; others set `process.exitCode=1`. Inspect the written evidence artifact for pass/fail.
- Inspect side-effect directories with `tree` before advising reruns; persisted state can change results.
- Verify `process.cwd()`-rooted paths and Electron `executablePath` before predicting runnability; hash-pinned `node_modules/.bun/electron@<ver>+<hash>/node_modules/electron/dist/electron.exe` paths can break after `bun install`.
- Read proof Vitest configs for `root`, `include`, environment, aliases, and jsdom requirements. Confirm every include matches an existing file; zero collected tests are not a passing baseline.
- For Windows proof configs, preserve repository-root paths, forward-slash includes, and established `coreAliases()` wiring. With `globals: false`, explicitly import every Vitest hook.
- Verify copied harness dependencies such as `./run-seam.js` exist before calling a proof runnable.
- Follow `packages/core/skills/verify-before-done/SKILL.md` for starting-state evidence, including revision, dirty paths, and pre-existing failures.