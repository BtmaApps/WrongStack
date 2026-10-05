## Test files

- Map leaf `*.test.ts` blast radius through collectors and gates, not call graphs: root and package `vitest.config.ts` `include`, `tsconfig.test.json` via `typecheck`, coverage thresholds (`packages/cli/vitest.config.ts`) — weakened assertions can fail coverage gates with zero code imports. Note CWD-relative scratch roots (`path.resolve('../../.temp_files')`) in CLI fleet tests. Collector shortcut: the per-file `projects` array in `docs/reports/architecture-health-current.json` is generated inventory — verify stale entries against package `include`/`exclude`.
- Close gated suites by grepping the gate env var repo-wide: `WRONGSTACK_SANDBOX_INTEGRATION` gates `packages/core/tests/sandbox/windows-native-integration.test.ts`, `container.test.ts`, `packages/tools/tests/sandbox-integration.test.ts`; no workflow sets it — manual-only.
- Root config is `globals: false`: vitest hooks (`afterAll`, `beforeEach`) in `packages/**/tests/**/*.test.ts` must be explicitly imported — gaps are win32 ReferenceErrors invisible to `tsc --noEmit -p packages/core`. Fix the test, never `packages/core/src/sandbox/index.ts` (public-API snapshot gate).
- `packages/webui/tests/components/chat-keep-alive.test.ts` asserts raw source text of `ViewRouter.tsx` (`<ChatView />`, `ws-view-parked`) — formatting edits there break it invisibly.

## Consumer closure

- Enumerate with grep `files_with_matches` before `content` — symbol-heavy files (`transport.test.ts`, 40× `StreamableHTTPTransport`) hit the per-file cap; then split prod vs test by path scope and direct vs barrel by a module-path grep (`transport-streamable`).
- Close re-exported symbols by symbol name, never module path: `codebase-incoming-calls` misses barrel-mediated and type-only consumers (`ReturnType<typeof storyStats>` in `StoryTables.tsx`; `fleet-selectors.ts` consumers via `fleet-store.ts`, where the hooks live).
- In `packages/sdd`, grep a class module and its sibling `-types.ts` both, splitting value vs `import type` before counting dependents; anchor with a symbol grep (`SddParallelRun`) plus `packages/sdd/src/index.ts` for transitive consumers.
- Confirm `codebase-impact-analysis` sites reported as `line: 0` (e.g. `applyHelper` → `packages/core/src/sandbox/wrap.ts`) with a literal-path grep before citing `file:line`.

## Known indirections

- TUI `Action` is the composite union in `packages/tui/src/app-action-type.ts`; each leaf `app-action-{runtime,settings,services,workflows}.ts` has one importer — close leaf claims with a symbol grep (`AppActionRuntime`) over `packages/tui/**`. `State` fields live in composed slices (`app-panel-state.ts`, `app-initial-state.ts`), not only `app-state.ts`.
- Resolve `packages/cli/src/slash-commands/mcp-utils.ts` to its real target: it re-exports `packages/cli/src/services/mcp-management.ts`; WebUI lists use `listMcp`/`McpServerInfo` in `packages/mcp/src/manage.ts`.
- For string-embedded scripts (`packages/core/src/sandbox/windows-helper.ts`), `read` the full file — `codebase-skeleton` compresses the behavioral contract inside the string.
- Trust code over doc prose: in-project config keys live in `IN_PROJECT_ALLOWED_KEYS`/`KNOWN_DENIED_IN_PROJECT`/`IN_PROJECT_DENIED_PATHS` in `packages/core/src/storage/config-loader/in-project-policy.ts`, not the hand-maintained lists in `docs/configuration.md`.

## Ignored scope (`.temp_files/`)

- Expect false zeros from `glob`, `tree`, and path-scoped `grep` here: prove existence with `read`, run a body-token control before trusting any grep zero, and close scratch callers with a repo-wide filename-stem grep — `Add-Type`/P/Invoke probes are manual-only by construction. `codebase-search` hits in ignored scope are name collisions, not callers; identify probes by grepping their Win32 symbol in tracked scope (`SaferCreateLevel` → `windows-helper.ts`). Capture gitignored content in reports — no git recovery.
- Growing `total_lines` between reads means a live append: report the growth, never a final count or verdict; verify via `read` head/tail, not `codebase-skeleton`.
- Proof rounds (`.temp_files/proof-driven-bug-hunter/<round>/`): classify the harness first — a `proof.ts` importing `node:assert/strict` with `main().catch(...)` is a standalone `tsx` script, not a vitest project. Close invocation with exact-directory `tree` plus repo greps for round dirname and config filename — root `vitest.config.ts` excludes `**/.temp_files/**`, so invocation is manual-only.
- A round `vitest.config.mts` header comment is its only spec (no `root`, `include` inside `test`, exact `../` count vs `repoRoot`); judge `resolve.alias` load-bearing only from the collected test's transitive value (non-`import type`) imports of `@wrongstack/core`.
