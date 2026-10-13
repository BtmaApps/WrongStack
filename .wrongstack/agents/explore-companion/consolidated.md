# explore-companion Role Instructions

## Evidence and Reporting

- Submit findings with `submit_result`; this role has no submission `mailbox`. Keep fields ASCII-only. On validation failure, shorten narrative and `files_examined` before dropping evidence.
- Separate confirmed dependencies, behavioral coupling, documentation references, and inconclusive checks. Tool errors, ignored paths, stale indexes, truncation, denied reads, and unvalidated zero-hit searches do not prove absence.
- Read targets directly; treat `codebase-skeleton`, `codebase-impact-analysis`, and `codebase-incoming-calls` as leads. Verify declarations, imports, re-exports, and runtime wiring.
- Verify a todo-named file exists before mapping it: glob the literal stem, then search its exact filename or label repo-wide. For example, `**/mailbox-http-*.ts` may miss while `surface: 'mailbox-http-server'` identifies `packages/cli/src/subcommands/handlers/mailbox-serve.ts`.
- When `todo-listener` is broadcasting, confirm the task remains live before deep-mapping; completion evidence such as file line counts can cross-check current source.
- Revalidate prior zero-consumer findings on every invocation; concurrent edits can change results. Capture scratch targets on the first successful read. After disappearance, verify once with a parent-directory tree and report captured evidence with its limitation.
- Never retry or bypass denied reads of `.npmrc`, `.env*`, `.pypirc`, or `.netrc`; report the restriction.
- For verbatim todo wording, search `packages/core/skills/**/SKILL.md` for the owning skill's acceptance contract.

## Search and Consumer Closure

- Classify targets before choosing tools: type-only modules, scripts, tests, configuration, JSON baselines, and logs need search or runner evidence, not merely call graphs.
- Close source consumers with repo-wide module-path, subpath, relative-specifier, and per-exported-symbol searches, including dynamic imports and inline type expressions. Separate value imports, type-only consumers, and individual exports.
- Do not pass module stems to `codebase-impact-analysis` as symbols; use module-path and exported-symbol searches plus the package barrel, including `packages/sage/src/index.ts` for Sage middleware.
- Classify matches by full import specifier and declaration source. A filename stem, duplicated helper name, comment, lockfile entry, or archived reference is not sufficient consumer evidence.
- Search `formatOutput` repo-wide before attributing callers: `packages/cli/src/slash-commands/dev.ts` has a local namesake, and `packages/webui` has `formatOutputBytes`; `codebase-incoming-calls` can report ambiguous symbols.
- In `packages/governance`, distinguish `verification-ledger-preconditions` imports from sibling `verification-ledger-preconditions-contracts.js` matches; verify current importers and barrel exposure rather than counting stem hits.
- In `packages/core/src/coordination/`, distinguish `instantiateRosterConfig` by arity and source: `director-input-helpers.ts` exports the two-argument version; `delegation/delegation-preparation.ts` has a four-argument local version. Likewise disambiguate local `stringArray` helpers and exact `readLeaderEffort` versus `readLeaderEffortOverride` matches.
- Avoid incoming-call tools for generic, barrel-mediated, or type-only symbols. Search runtime strings, subprocess arguments, `spawn`/`exec` bodies, and non-TypeScript harnesses as well.
- Enumerate with case-sensitive `files_with_matches` and confirm `truncated=false`. When content output is capped, read enclosing ranges; split grep alternations exceeding 256 characters to avoid `VALIDATION_ERROR`.

## Public Surfaces and Indirect Dependencies

- Verify public exposure through `package.json` `exports` and actual package-barrel re-exports, not facade visibility alone. Named export lists and `export *` have different exposure behavior.
- For `packages/mcp`, check `packages/mcp/src/index.ts`, not only `src/transport.ts`: the transport export list includes `HttpTransportOptions`, `SSEReader`, `SSETransport`, and `StreamableHTTPTransport`, not every facade export.
- Alias-substituted fixtures may have no static importers. Search the substituted specifiers and Vite `resolve.alias` entries; distinguish value imports from type-only imports that aliases do not affect.
- Behavioral dependencies may exist without imports: inspect environment-variable seams, spawning daemons, and distinctive assertions that establish regression coverage.
- For `packages/*/tests/`, check `architecture/test-skip-budget.json` and `docs/reports/architecture-health-current.json`; skip/content changes can require re-syncing through root `check:architecture`.
- Treat `architecture/*.json` as data ratchets. Check `architecture/core-public-api-usage.json` for target paths and `architecture/test-only-exports.json` for export constraints; trace guarding scripts and use root `check:architecture` / `check:architecture:sync` as appropriate.
- Confirm package-manager state against root `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `package.json` `packageManager`, not monorepo fixture copies.

## Scratch Proof Rounds

- For `.temp_files/proof-driven-bug-hunter/<round>/`, bypass indexes with direct `read`, `tree`, and explicitly path-scoped grep; default repo-wide searches skip `.temp_files`, and zero in-directory references do not exclude external `vitest run -c` invocation.
- Tree the round before describing execution. Only `proof.ts`, without `run.mjs`, `vitest.proof.config.mjs`, or `REPORT.md`, indicates a bare direct-path proof whose exit codes 0/1/2 are its interface, not a completed report-backed round.
- Verify every config's `include` target exists before calling it runnable. `vitest run -c` collecting zero tests is not proof of a passing baseline.
- Close scratch-artifact consumers with an explicit parent-hunt-directory grep for the round ID plus repo-wide distinctive harness needles; classify `verify-full.ps1` and `full-verification/runtime-temp/` self-matches as harness residue, not consumers.

## Project Wiring Anchors

- Close CLI subcommand handlers through the lazy-import registry in `packages/cli/src/subcommands/index.ts` plus filename and symbol searches. Check test `vi.mock` paths against live imports.
- WebUI views register in `packages/webui/src/components/view-registry.ts`; HQ views register in `packages/webui-hq/src/components/hq/view-router.tsx`. Check HQ lazy-chunk boundaries and `packages/webui-hq/tests/components/views-smoke.test.tsx` when tracing `@xyflow/react`.
- Parallel adapters can share behavior without importing one another. Inspect `packages/webui-server/src/server/*-adapter.ts` core imports and symbol contracts before asserting independence from CLI behavior.