# explore-companion Role Instructions

## Evidence and Reporting

- Use `codebase-skeleton`, `codebase-impact-analysis`, `codebase-incoming-calls`, and `codebase-search` for discovery; verify conclusions against source, imports, runtime wiring, configuration, and tests.
- Revalidate consumer and absence claims on every invocation. Concurrent edits, ignored paths, stale indexes, truncated output, and tool errors can invalidate findings.
- Treat zero hits as inconclusive until traversal is validated. Distinguish failed or inaccessible searches from genuinely absent files or consumers.
- Close exhaustive searches with `files_with_matches` or verified untruncated output. If reported counts exceed displayed matches despite `truncated=false`, use ranged reads or archived `~/.wrongstack/tool-output/*.log` output; preserve the exact log path.
- Separate runtime consumers, type-only consumers, behavioral coupling, configuration references, documentation, and generated metadata.
- Submit findings through `submit_result`, including `suggested_next_steps`; use an empty array when no follow-up is needed.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.

## Task Orientation

- Resolve task-named files using exact filenames, literal stems, labels, or distinctive runtime strings before mapping impact.
- For vague tasks without file hints, inspect an mtime-descending `glob` over `packages/**/src/**` and `packages/**/tests/**`, then examine candidate clusters with `codebase-skeleton`.
- Read the owning `packages/core/skills/**/SKILL.md` when acceptance wording matters.
- Classify targets as modules, suites, scripts, configurations, baselines, generated artifacts, or data before selecting analysis tools.

## Consumer and Public-API Closure

- Read exact exported names before incoming-call analysis; pair graph results with module-specifier and per-export searches, including sibling tests.
- Match complete import specifiers rather than bare filename prefixes; cover relative paths, aliases, barrels, multiline imports, dynamic `import()`, `require()`, mocks, and non-TypeScript harnesses.
- Content searches do not match filenames automatically; reconcile importer results against actual import specifiers, not the target module’s presence in results.
- Read match context to distinguish executable calls from comments, template-generated source, duplicate names, and metadata.
- Inspect actual re-exports and `package.json` `exports` before claiming public availability; resolve facade symbols rather than assuming the importing file defines them.
- Search type-only exports and `ReturnType<typeof hook>` aliases separately; runtime call graphs omit these consumers.
- Trace behavioral seams beyond imports: rendered CSS selectors, environment variables, subprocess arguments, runtime strings, snapshots, and assertions.
- Read caller wrappers around reducers and state models to identify filtering, ownership checks, and post-processing.
- Treat `codebase-impact-analysis` results with `totalCallSites=0`, `symbolFound=true`, and huge unrelated `line:0` closures as noise; verify exact exports and barrel imports directly, especially under `packages/sage/src` and `store-helpers.ts`.
- For `packages/webui-server/src/server/start-webui.ts`, combine module-specifier and `\bstartWebUI\s*\(` searches with context reads; account for `src/server/index.ts`, `scripts/build-package.mjs`, and generated smoke-harness source.
- For `packages/kanban/src/manager/*` helpers, search both direct specifiers and `manager/_internal(\.js)?`; distinguish root `@wrongstack/kanban` imports from package subpaths.
- For `packages/mcp/src/manifest-cache.ts`, prefer its module specifier, `manifestConfigHash`, or capability-manifest names over collision-prone `readManifest`/`writeManifest`.
- For `packages/core/src/utils/*`, inspect `utils/index.ts` and `architecture/core-public-api-snapshot.json` alongside symbol searches.
- Trace desktop main/preload wiring through `scripts/build-package.mjs`, `apps/desktop/package.json`’s `main`, `runtime-manager-paths.ts`, and `contextBridge.exposeInMainWorld`.
- Inspect installed dependencies through direct reads, package metadata, and `bun.lock`; index tools may omit `node_modules/.bun/<pkg>@<ver>+<hash>/node_modules/<pkg>/`.

## Test Discovery and Edit Gates

- Map tests through filename references, package-local and root Vitest collection, package scripts, coverage thresholds, and architecture ratchets; tests usually have no exports for incoming-call analysis.
- Verify configuration existence and inheritance rather than assuming package-local configuration; `packages/core` uses root Vitest configuration.
- Compare `setupFiles` and `globalSetup`: `packages/webui-server/vitest.config.ts` omits root `vitest.setup.ts` isolation and `vitest.globalTeardown.ts` daemon reaping.
- Verify both root and local runners when applicable, including `apps/desktop`; root collection covers `packages/**/tests/**/*.test.{ts,tsx}` and `apps/**/tests/**/*.test.{ts,tsx}`.
- CLI verification requires both `bun run test` and `bun run test:hqdash` in `packages/cli`; the main config excludes `tests/hq-dashboard.test.ts`.
- Check `architecture/test-typecheck-baseline/packages-<pkg>.json`; a missing baseline means zero tolerated diagnostics, not exemption.
- Inspect `test`, `typecheck:tests`, architecture constraints, and `docs/reports/architecture-health-current.json` before predicting release impact.
- For `packages/kanban/src/verification/*`, inspect `packages/kanban/tests/verification/`; indirect coverage may flow through `validateCommand` or `VerificationContext.runCommand`.

## Ignored Paths and Scratch Harnesses

- Establish existence under `.temp_files/**` and `packages/*/dist/*` with `tree` or direct reads; validate path-scoped grep traversal with a known-present string before interpreting index or glob zeros.
- Capture scratch contents and inventory early; concurrent cleanup can remove evidence, so label inferred wiring explicitly.
- Close scratch invocations with directory inventory, a path-scoped file-stem search, and a repo-wide round-name search; reject coincidental log matches.
- A `.temp_files/proof-driven-bug-hunter/<round>/proof.ts` without `run.mjs`, `vitest.proof.config.mjs`, or `describe`/`it` blocks runs via `bun .temp_files/proof-driven-bug-hunter/<round>/proof.ts`; stdout `FAIL:` lines and exit status define its result contract.
- Root Vitest excludes `tmp/` and `.temp_files/`; an explicit path does not override collection rules, and zero collected tests are not a passing baseline.
- Trace scratch configuration through base spreads, compiled `.js` twins, plugin hooks, cwd-relative paths, aliases, setup files, environment requirements, and explicit hook imports when `globals: false`.
- Read harness `catch`, `finally`, script tails, and result artifacts before interpreting exit codes or recommending reruns; swallowed assertions may appear only in `evidence/results.json`.
- Verify Electron runner environment, executable paths, timeout and log contracts; hash-pinned `.bun` paths can break after installation.
- In Playwright harnesses, confirm shared page globals are assigned inside `page.evaluate`; returned objects belong to Node.
- Follow `packages/core/skills/verify-before-done/SKILL.md` for starting-state revision, dirty paths, and pre-existing failures.