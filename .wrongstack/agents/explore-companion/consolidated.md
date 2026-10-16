# explore-companion Role Instructions

## Evidence and Reporting

- Read targets directly before drawing conclusions. Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery, then verify declarations, imports, re-exports, runtime wiring, configuration, and tests from source.
- Treat ignored paths, stale indexes, truncated output, tool errors, and unvalidated zero-hit searches as inconclusive. Confirm exhaustive searches with case-sensitive results, `files_with_matches`, and `truncated=false`.
- Revalidate consumer and absence claims on every invocation because concurrent edits may invalidate earlier findings.
- Classify findings precisely: distinguish runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation references, generated artifacts, and search noise.
- Submit findings through `submit_result` and always include `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Orienting Vague Tasks

- For a vague todo without file hints, run an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`. Inspect the freshest matching production/test cluster with `codebase-skeleton`; the pair and nearby header comments usually identify the active subject without full-file reads.
- Verify todo-named files by searching the literal stem, exact filename, label, or distinctive runtime string before mapping impact.
- Inspect `.temp_files/proof-driven-bug-hunter/` separately with direct `tree`; ignored-directory rules can make `glob '.temp_files/**'` return zero despite existing contents.
- When exact workflow or acceptance wording matters, inspect the owning `packages/core/skills/**/SKILL.md`.

## Consumer Closure

- Classify the target before tracing it. Source modules, test suites, scripts, configuration, JSON baselines, generated files, runtime logs, and data files require different evidence.
- Close source-module consumers with both module-path and exported-symbol searches. Include relative imports, package aliases, barrel imports, dynamic imports, tests, mocks, and non-TypeScript harnesses.
- Never pass a filename stem to `codebase-impact-analysis` as though it were a symbol. For unbarreled data modules, probe exported symbols with `codebase-incoming-calls` and grep the module path, including optional `.js` suffixes.
- Barrel re-exports can hide consumers behind package aliases. Search exported names as well as paths, and inspect whether the barrel uses `export *` or a maintained named-export list.
- Distinguish `import type` from value imports; type-only references do not establish runtime package edges.
- Classify hits by their complete import specifier. Exclude comments, lockfiles, generated indexes, build metadata, duplicate helper names, and prefix-only matches.
- For prefix-colliding packages such as `@wrongstack/webui`, search the exact quoted bare specifier, such as `@wrongstack/webui"`, and separate it from siblings including `@wrongstack/webui-server` and `@wrongstack/webui-protocol`.
- Check shared helpers by exact name before reporting equivalent logic as local. Constant-time token comparison should be checked against `timingSafeTokenEqual` in `packages/primitives/src/timing-safe.ts`.
- Search behavioral seams when imports are insufficient: environment variables, subprocess arguments, alias substitution, runtime strings, snapshots, resource limits, and distinctive assertions.

## Tests, Data, and Architecture Ratchets

- Treat `packages/*/tests/**` as test suites unless source proves otherwise. Suites usually export nothing; determine dependents with a repo-wide test-stem grep and runner `include` globs rather than symbol-impact tools.
- Check `architecture/*.json` and `docs/reports/architecture-health-current.json` for path-based ratchets. Relevant files include `architecture/test-only-exports.json`, which may list test-only exports or suite paths.
- For `packages/cli/tests/wrongforge-leader/*`, use a repo-wide stem grep plus `architecture/test-only-exports.json` and `docs/reports/architecture-health-current.json`. Trace production consumers separately with a module-path search such as `wrongforge-leader-provider(\.js)?`.
- Treat version pins such as `.bun-version` as data, not code. Read the file directly and grep its filename and literal value repo-wide; call-graph and skeleton tools generally provide no useful consumer evidence.
- Establish package-public exposure from both `package.json` `exports` and actual barrel re-exports; a facade file alone does not prove public availability.

## Proof-Driven Bug-Hunter Rounds

- Begin every proof-round investigation with `tree .temp_files/proof-driven-bug-hunter/<round>/`. Directory contents determine whether the round is scaffolded, runnable, incomplete, or only a direct-run proof.
- Do not infer absence from `.temp_files/**` glob results. Use direct `tree` to detect ignored contents and nested artifacts such as `node_modules` junctions.
- Determine the runner from actual files:
  - `run.mjs` indicates a custom runner.
  - `vitest.proof.config.mjs` or `vitest.proof.config.mts` defines a Vitest runner contract.
  - A lone `proof.ts` without runner, config, or `REPORT.md` is a bare direct-run proof.
- Read the Vitest config before predicting filenames, environment, or commands. Verify `root`, `include`, `environment`, aliases, and whether an in-file jsdom pragma is required.
- Vitest proof configs must use the repository root, forward-slash `include` paths, and the established `coreAliases()` wiring; these details are load-bearing on Windows. Prefer copying a working config from another round.
- Confirm every config `include` matches an existing file. A run that collects zero tests is not a passing baseline.
- With `globals: false`, verify that every used hook—such as `beforeAll` and `afterAll`—is explicitly imported from `vitest`; missing hooks fail during collection before exercising the defect.
- Tree copied harnesses before calling them runnable. Imports such as `./run-seam.js` and `./run-baseline.js` may point to companion files that were not copied into the round.
- Describe a proof test’s dependents as its config `include` globs and production imports. Editing a scratch proof is normally round-local unless explicit searches show otherwise.
- Interpret “clean up round dir” from direct directory contents; when the round contains only `proof.ts`, deletion scope is exactly that round directory.
- Do not assume reports or dedup ledgers persist on disk. Verify with direct `tree` and a repo-wide grep for `dedup ledger`; if absent, reconstruct the paper trail from session history.
- Follow the starting-state contract in `packages/core/skills/verify-before-done/SKILL.md`, including revision, dirty paths, and pre-existing failing tests.