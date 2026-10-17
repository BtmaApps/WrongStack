# explore-companion Role Instructions

## Evidence and Reporting

- Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery; verify conclusions against source, imports, re-exports, runtime wiring, configuration, and tests.
- Revalidate consumer and absence claims on every invocation. Concurrent edits, ignored paths, stale indexes, truncated output, and tool errors can invalidate findings.
- Treat zero-hit searches as inconclusive until traversal is validated. After an unexpected ENOENT, glob the containing directory to distinguish a missing target from inaccessible or deleted surroundings.
- Close exhaustive searches with `files_with_matches` and untruncated output. Separate runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation, and generated metadata.
- If a truncated `read` is archived under `~/.wrongstack/tool-output/*.log`, search that log for omitted evidence or pattern counts; copy its path exactly.
- Submit findings through `submit_result`, including `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Task Orientation

- Resolve task-named files using literal stems, exact filenames, labels, or distinctive runtime strings before mapping impact.
- For vague tasks without file hints, inspect an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`, then examine candidate clusters with `codebase-skeleton`.
- Read the owning `packages/core/skills/**/SKILL.md` when acceptance wording matters.
- Classify targets before tracing them: modules, suites, scripts, configurations, baselines, generated artifacts, and data require different evidence.

## Consumer and Public-API Closure

- Close module consumers with module-path searches, repo-wide searches for **each exported symbol**, and incoming-call analysis; cover relative imports, aliases, barrels, multiline imports, dynamic imports, mocks, tests, and non-TypeScript harnesses.
- Never pass a filename stem to `codebase-impact-analysis` as though it were a symbol. A zero-call result may reflect a stale index; a sole consumer with no importers is a dead-code signal to report, not grounds to stop tracing.
- Inspect actual re-exports and `package.json` `exports` before claiming public availability. Resolve facade symbols with `codebase-search` rather than assuming the importing file defines them.
- Match complete import specifiers, distinguish type-only edges, and exclude comments, lockfiles, generated indexes, duplicate names, and package-prefix collisions.
- For `@wrongstack/kanban`, distinguish `from '@wrongstack/kanban';` from `/test-support`, `/manager/lifecycle`, `/contract-graph`, and `/queue-anomalies`; subpaths bypass `packages/kanban/src/index.ts`.
- For `packages/kanban/src/verification/*`, pair exported-symbol incoming calls with `packages/kanban/tests/verification/` inspection; tests often exercise modules indirectly through `validateCommand` or `VerificationContext.runCommand`.
- For `packages/kanban/src/server/client.ts`, search every exported name, including `getKanbanServerConnection`, `closeKanbanServerConnections`, and `isKanbanServerAvailable`; path-only searches miss `./client.js` and barrel consumers.
- For `packages/tui/src/cell-selection.ts`, search `selectionText`, `selectedRuns`, `mountedTextRuns`, and `screenOrigin` individually; neither path grep nor call-graph results alone closes consumers.
- For `packages/tui/src/components/settings-picker-model.ts`, resolve definitions through `settings-picker-constants.ts` and `settings-picker-resolver.ts`, and check `architecture/test-only-exports.json`.
- Trace behavioral seams beyond imports: environment variables, subprocess arguments, aliases, runtime strings, snapshots, and assertions.
- For `packages/core/src/utils/*`, inspect `utils/index.ts` and `architecture/core-public-api-snapshot.json` alongside exported-symbol searches.
- Trace desktop main/preload entry points through `scripts/build-package.mjs`, `apps/desktop/package.json`’s `main`, `runtime-manager-paths.ts`, and `contextBridge.exposeInMainWorld`; `apps/desktop/src/main/validation/schemas.ts` requires direct-import tracing because its adjacent `index.ts` does not re-export it.
- Inspect `node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>/` through direct reads, package metadata, and `bun.lock`, not index tools; trace launchers through `scripts`, `bin`, and repository dependencies.

## Test Discovery and Edit Gates

- Map test files through three closures, in order: repo-wide filename references; collection in both package-local and root `vitest.config.ts`; edit gates in package scripts, coverage `thresholds`, and `architecture/test-typecheck-baseline/packages-<pkg>.json`. Tests generally export no symbols for incoming-call analysis.
- Root Vitest includes `packages/**/tests/**/*.test.{ts,tsx}` and `apps/**/tests/**/*.test.{ts,tsx}`. `apps/desktop` also collects `tests/**/*.test.ts` through its local config and `test` script; check both runners.
- Check package-local configuration rather than assuming it exists: `packages/core` uses the root Vitest configuration.
- Inspect `test` and `typecheck:tests` scripts and architecture ratchets before describing edit impact; new test-typecheck diagnostics can block release.
- Root collection excludes scratch tests under `tmp/` and `.temp_files/`. An explicit scratch path does not override collection rules; verify a dedicated config or alternative runner actually collects tests.
- Check `architecture/*.json` and `docs/reports/architecture-health-current.json` for path-based constraints, distinct from code consumers.
- Treat version pins such as `.bun-version` as data: read directly and search both filename and literal value.

## Scratch Configurations and Proof Harnesses

- On first inspection of `.temp_files/<round>/`, capture the target’s full contents and a directory `tree`; concurrent cleanup can delete the entire directory. Label wiring inferred when supporting files disappear.
- Use direct reads and `tree` for ignored scratch files. Normal `rg` respects `.gitignore`, and `.temp_files/**` is excluded from root Vitest; do not repeatedly query indexes to prove non-indexing.
- Map scratch configs through outbound dependencies: the base config spread with `...base`, plugin `load`/`resolveId` interceptions, and cwd-relative `include`/`setupFiles` when `test.root` is unset. Search the round name for invocation references.
- When a base config is imported with a `.js` specifier, run `glob packages/<pkg>/vitest.config.*`; a compiled `.js` twin may load instead of the TypeScript source.
- Under `.temp_files/proof-driven-bug-hunter/<round>/`, inspect both `vitest.config.ts` and `vitest.proof.config.mjs`. Configs using `path.resolve(here, '../../..')` depend on directory depth; verify `root: here` and include resolution before predicting collection.
- Determine invocation from actual scripts, configs, and references. Missing `run.mjs` or `evidence/` alone does not establish how a proof runs.
- Check every include and copied dependency such as `./run-seam.js`; zero collected tests are not a passing baseline. Verify aliases, environment, jsdom requirements, and explicit hook imports when `globals: false`.
- Read harness `catch`, `finally`, and script tails before interpreting exit codes; swallowed assertions may appear only in `evidence/results.json`. Inspect evidence artifacts and side-effect directories before recommending reruns.
- Verify `process.cwd()`-relative paths and Electron `executablePath`; hash-pinned `.bun` paths can break after `bun install`.
- Follow `packages/core/skills/verify-before-done/SKILL.md` for starting-state evidence, including revision, dirty paths, and pre-existing failures.