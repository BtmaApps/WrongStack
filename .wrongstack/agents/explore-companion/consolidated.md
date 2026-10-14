# explore-companion Role Instructions

## Evidence and Reporting

- Submit findings with `submit_result`; this role has no submission mailbox. Keep fields ASCII-only. If validation fails, shorten narrative and `files_examined` before removing evidence.
- Read the target directly. Treat `codebase-skeleton`, `codebase-impact-analysis`, and `codebase-incoming-calls` as discovery aids, then verify declarations, import specifiers, re-exports, runtime wiring, and tests from source.
- Separate confirmed dependencies, type-only consumers, behavioral coupling, documentation references, and inconclusive checks. Tool errors, ignored paths, stale indexes, truncation, denied reads, and unvalidated zero-hit searches do not prove absence.
- Revalidate zero-consumer findings on every invocation because concurrent edits may invalidate prior results. Confirm exhaustive searches with case-sensitive `files_with_matches` and `truncated=false`.
- If a target disappears after being read, inspect its parent directory once and report the captured evidence with that limitation.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.
- Verify todo-named files before mapping them: glob the literal stem, then search the exact filename, label, or distinctive runtime string repo-wide. When `todo-listener` is broadcasting, confirm the task is still live before deep analysis.
- For exact todo acceptance wording, search the owning `packages/core/skills/**/SKILL.md`.

## Target Classification

- Classify a target before tracing it. Source modules, type-only contracts, test suites, scripts, configuration, JSON baselines, generated files, and runtime logs require different evidence.
- Files under `~/.wrongstack/projects/<hash>/sessions/` are runtime JSONL transcripts, not source modules. Trace their producer and readers through exact searches such as `grep "transcript\.jsonl"` rather than looking for exports.
- Treat `packages/*/tests/**` as Vitest suites unless source proves otherwise. They usually export nothing; “dependents” means the runner include globs and the production modules they exercise. Search the test stem repo-wide to confirm whether anything imports it.
- Verify a scratch proof’s structure before describing it as runnable or complete. A lone `proof.ts` is not equivalent to a round containing `run.mjs`, `vitest.proof.config.mjs`, and `REPORT.md`.

## Consumer Closure

- Close source consumers with both module-path and exported-symbol searches. Include package aliases, barrel imports, relative paths, dynamic imports, inline type expressions, tests, mocks, and non-TypeScript harnesses.
- For `export *` barrels, search every exported name as well as the module path. Distinguish value imports from `import type`; type-only consumers do not establish runtime package edges.
- Do not pass filename stems to `codebase-impact-analysis` as though they were symbols. Unexposed modules such as `packages/core/src/core/fleet-pulse.ts` require searches for their exported symbols and direct module paths.
- Classify every hit by full import specifier and declaration source. Duplicate helper names, prefix matches, comments, lockfiles, `tsconfig.tsbuildinfo`, generated artifacts, and archived references are not consumer evidence.
- When names collide, use module-path searches plus import-specifier checks rather than symbol grep alone. This is required for generic names such as `breakStaleLock`, `renderProgress`, `renderTaskList`, and `memory-handlers`.
- Avoid incoming-call tools for generic, barrel-mediated, type-only, or string-driven dependencies. Inspect runtime strings, environment-variable seams, subprocess arguments, `spawn`/`exec` bodies, and distinctive assertions.
- If content grep is capped, read the enclosing ranges and follow it with `files_with_matches`. Split grep alternations longer than 256 characters to avoid `VALIDATION_ERROR`.

## Public and Indirect Surfaces

- Establish public exposure from both `package.json` `exports` and actual package-barrel re-exports. A facade file alone does not prove package visibility.
- Distinguish `export *` from named re-export lists: new exports flow automatically through the former but remain private through the latter until explicitly listed.
- Alias-substituted fixtures may have no direct static importers. Search substituted specifiers and Vite `resolve.alias` entries, separating value imports from type-only imports.
- Behavioral dependencies may exist without imports. Check environment-variable contracts, daemon spawning, resource limits, snapshots, and assertions that pin behavior.
- Treat `architecture/*.json` as data ratchets. Check `architecture/core-public-api-usage.json`, `architecture/test-only-exports.json`, `architecture/test-skip-budget.json`, and `docs/reports/architecture-health-current.json` when relevant; use root `check:architecture` or `check:architecture:sync`.
- Confirm package-manager state against root `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the root `package.json` `packageManager`, not fixture copies.

## Scratch Proof Rounds

- For `.temp_files/proof-driven-bug-hunter/<round>/`, bypass indexes with direct `read`, `tree`, and explicitly path-scoped grep because default repo-wide searches may skip `.temp_files`.
- Verify every proof config’s `include` target exists. `vitest run -c` collecting zero tests is not evidence of a passing baseline.
- A bare direct-path proof may use exit codes `0`, `1`, and `2` as its interface; do not invent report-backed semantics.
- Close scratch-artifact consumers with a parent-directory grep for the round ID plus repo-wide searches for distinctive harness strings. Classify `verify-full.ps1` and `full-verification/runtime-temp/` self-matches as harness residue.

## Project Wiring Anchors

- Close CLI subcommand handlers through the lazy-import registry in `packages/cli/src/subcommands/index.ts`, then search filenames, exported symbols, and `vi.mock` paths.
- WebUI views register in `packages/webui/src/components/view-registry.ts`; HQ views register in `packages/webui-hq/src/components/hq/view-router.tsx`. Check lazy-chunk boundaries and `packages/webui-hq/tests/components/views-smoke.test.tsx`.
- WebSocket handlers under `packages/webui-server/src/server/*-ws-handler.ts` can be wired by embedded `backend-services.ts` and `packages/cli/src/webui-server/domain-handlers.ts`, with type references in connection/router contracts. Resource-cap changes may also be pinned by `packages/core/tests/architecture/ram-leak-caps-guard.test.ts`.
- When tracing `packages/webui-server/src/server/**`, search cross-package direct source imports such as `../../webui-server/src/...`; tests can bypass package barrels.
- Parallel adapters may share contracts without importing one another. Inspect each adapter’s core imports and symbol contracts before asserting dependency or independence.
- For `packages/mcp`, verify exposure through `packages/mcp/src/index.ts`; do not infer that every export from `src/transport.ts` is package-public.