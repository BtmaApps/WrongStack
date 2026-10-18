# explore-companion Role Instructions

## Evidence and Reporting

- Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery; verify conclusions against source, imports, runtime wiring, configuration, and tests.
- Revalidate consumer and absence claims on every invocation. Concurrent edits, ignored paths, stale indexes, truncated output, and tool errors can invalidate findings.
- Treat zero-hit searches as inconclusive until traversal is validated. Distinguish inaccessible paths and failed searches from genuinely missing files or consumers.
- If `grep` reports `count=N matches, showing 3` despite `truncated=false`, treat the display as truncated; after two identical displays, use ranged `read` and reconcile the claimed match count against the evidence read.
- Close exhaustive searches with `files_with_matches` or verified untruncated output. Separate runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation, and generated metadata.
- If truncated output is archived under `~/.wrongstack/tool-output/*.log`, inspect that log for omitted evidence and preserve its exact path.
- Submit findings through `submit_result`, including `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Task Orientation

- Resolve task-named files using literal stems, exact filenames, labels, or distinctive runtime strings before mapping impact.
- For vague tasks without file hints, inspect an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`, then examine candidate clusters with `codebase-skeleton`.
- Read the owning `packages/core/skills/**/SKILL.md` when acceptance wording matters.
- Classify targets before tracing them: modules, suites, scripts, configurations, baselines, generated artifacts, and data require different evidence.

## Consumer and Public-API Closure

- Read exact exported spellings with `codebase-skeleton` before incoming-call analysis; guessed names or filename stems can produce misleading zero-caller results.
- Pair incoming-call analysis with module-path and per-export repo-wide searches; verify unexpected omissions with file-scoped searches and sibling tests such as `packages/<pkg>/tests/<module-stem>.test.ts`.
- Search type-only exports and `ReturnType<typeof hook>` aliases separately; runtime call graphs do not capture their prop and import consumers.
- Search rendered CSS class names when mapping React component impact; browser tests such as `packages/vibeui/tests/browser-smoke.mjs` may select classes without importing component symbols.
- Read caller wrappers around reducers and state models to identify filtering, ownership checks, and post-processing that define the behavioral boundary.
- Cover relative imports, aliases, barrels, multiline imports, dynamic imports, mocks, tests, and non-TypeScript harnesses. Match complete specifiers and exclude comments, lockfiles, generated indexes, duplicate names, and package-prefix collisions.
- Inspect actual re-exports and `package.json` `exports` before claiming public availability. Resolve facade symbols with `codebase-search` rather than assuming the importing file defines them.
- Trace behavioral seams beyond imports: environment variables, subprocess arguments, runtime strings, snapshots, and assertions. A sole caller is not a reason to stop tracing.
- For `@wrongstack/kanban`, distinguish root imports from subpaths such as `/test-support`, `/manager/lifecycle`, `/contract-graph`, and `/queue-anomalies`, which bypass `packages/kanban/src/index.ts`.
- For `packages/kanban/src/verification/*`, inspect `packages/kanban/tests/verification/`; tests may exercise modules indirectly through `validateCommand` or `VerificationContext.runCommand`.
- For `packages/core/src/utils/*`, inspect `utils/index.ts` and `architecture/core-public-api-snapshot.json` alongside symbol searches.
- Trace desktop main/preload entry points through `scripts/build-package.mjs`, `apps/desktop/package.json`’s `main`, `runtime-manager-paths.ts`, and `contextBridge.exposeInMainWorld`.
- Inspect dependencies under `node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>/` through direct reads, package metadata, and `bun.lock`, not index tools; trace launchers through `scripts` and `bin`.

## Test Discovery and Edit Gates

- Map tests through filename references, collection in package-local and root `vitest.config.ts`, then package scripts, coverage `thresholds`, and `architecture/test-typecheck-baseline/packages-<pkg>.json`; tests usually have no exports for incoming-call analysis.
- Compare local and root `setupFiles` and `globalSetup` before predicting behavior: `packages/webui-server/vitest.config.ts` omits root `./vitest.setup.ts` (`WRONGSTACK_HOME` isolation) and `./vitest.globalTeardown.ts` (daemon reaping), so package-local `bun run test` can behave differently.
- Root Vitest includes `packages/**/tests/**/*.test.{ts,tsx}` and `apps/**/tests/**/*.test.{ts,tsx}`; `apps/desktop` also has local collection. Verify both runners when applicable.
- Check whether package-local configuration exists rather than assuming it does; `packages/core` uses the root Vitest configuration.
- Inspect `test`, `typecheck:tests`, architecture ratchets, and `docs/reports/architecture-health-current.json` before describing edit impact; path constraints and new test-typecheck diagnostics can block release independently of runtime consumers.
- Root collection excludes scratch tests under `tmp/` and `.temp_files/`; an explicit path does not override collection rules. Verify a dedicated config or alternative runner actually collects tests.
- Treat version pins such as `.bun-version` as data: read directly and search both filename and literal value.

## Ignored Paths and Scratch Harnesses

- Use `tree` or direct `read`, not `glob`, to establish existence under `.temp_files/**` and `packages/*/dist/*`; ignore-suppressed zero results do not establish absence.
- Validate search traversal into `.temp_files/**` with a known-present string and a path-scoped `grep`; root `rg` and `codebase-*` indexes exclude these paths.
- On first inspection of `.temp_files/<round>/`, capture the target’s contents and directory `tree`; concurrent cleanup may remove supporting files, in which case label inferred wiring explicitly.
- Close scratch-script invocations with directory inspection, a repo-wide round-name search, and a path-scoped scratch search; read match context to reject coincidental JSONL log matches.
- Read sibling Electron runners such as `run.ps1`; `PROVE_MODE`, `PROVE_LOG`, `PROVE_DESKTOP_DIST`, kill timeouts, and log-parsing fields define the harness contract.
- Trace scratch configuration through base spreads, plugin `load`/`resolveId` hooks, and cwd-relative `include`/`setupFiles`; verify directory-depth assumptions and `root` before predicting collection.
- When a config imports a `.js` base, check for a compiled twin with `glob packages/<pkg>/vitest.config.*`; it may load instead of the TypeScript source.
- Verify every include, copied dependency, alias, environment requirement, and explicit hook import when `globals: false`; zero collected tests are not a passing baseline.
- Read harness `catch`, `finally`, and script tails before interpreting exit codes; swallowed assertions may appear only in `evidence/results.json`. Inspect artifacts and side-effect directories before recommending reruns.
- Verify `process.cwd()`-relative paths and Electron `executablePath`; hash-pinned `.bun` paths can break after `bun install`.
- In Playwright harnesses, confirm shared page globals are assigned inside `page.evaluate`; returned objects belong to Node, and spreading an unset page global can silently produce empty evidence.
- Follow `packages/core/skills/verify-before-done/SKILL.md` for starting-state evidence, including revision, dirty paths, and pre-existing failures.