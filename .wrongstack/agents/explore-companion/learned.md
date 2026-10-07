# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:59:23.484Z; skill=codebase-navigation; applied=95; wins=95; skipped=63; skippedWins=62 -->
- **Always classify `scripts/build-package.mjs` in WrongStack as a zero-export top-level build script: close its consumers with a repo-wide filename grep over `package.json` `build` scripts plus `scripts/build.mjs` (the cmd.exe orchestrator reachable from root `package.json` `"build"`), never `codebase-incoming-calls`. Its dispatch key is `packageJson.name` against the `profiles` registry (~L213-560); an unregistered package name throws, and the registry's comment-documented invariants (`splitting: true` for `@wrongstack/core`/`@wrongstack/tools`, entry keys as dist output paths, TUI bundling react) are the real edit blast radius. Architecture tests in `packages/core/tests/architecture/` and `packages/tools/tests/architecture/` reference the script by filename.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `scripts/build-package.mjs`
  - *How:* `package.json`
  - *How:* `build`
  - *How:* `scripts/build.mjs`
  - *How:* `"build"`
  - *How:* `codebase-incoming-calls`
  - *How:* `packageJson.name`
  - *How:* `profiles`
  - *How:* `splitting: true`
  - *How:* `@wrongstack/core`
  - *How:* `@wrongstack/tools`
  - *How:* `packages/core/tests/architecture/`
  - *How:* `packages/tools/tests/architecture/`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:06:15.607Z; skill=codebase-navigation; applied=105; wins=105; skipped=92; skippedWins=91 -->
- **Always classify a core type module as caller-less before running `codebase-incoming-calls`: when every export is an `interface` (e.g. `packages/core/src/types/one-shot-llm.ts`), the call graph is empty by construction and the real consumer closure is a repo-wide exported-symbol grep plus a file-stem grep. Include inline type expressions in the symbol pass — cross-package consumers can reach core types through `import('@wrongstack/core/types').SomeOption['field']` (as `packages/cli/src/wiring/provider-utility-tools.ts` does), which a file-stem search never catches.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `codebase-incoming-calls`
  - *How:* `interface`
  - *How:* `packages/core/src/types/one-shot-llm.ts`
  - *How:* `import('@wrongstack/core/types').SomeOption['field']`
  - *How:* `packages/cli/src/wiring/provider-utility-tools.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T05:46:37.578Z; skill=codebase-navigation; applied=24; wins=24; skipped=42; skippedWins=41 -->
- **Always close consumers of `packages/kanban/src/types.ts` with quote-anchored relative-specifier greps (`from ['"](\.{1,2}/)+types\.js['"]`), never `codebase-incoming-calls` — it is a type-only module with an empty call graph by construction, and the anchoring is required because sibling stems (`supervision-types.js`, `task-policy-types.js`, `verification-types.js`, `types-contract-graph.js`) share the `types` suffix. Treat `packages/kanban/src/index.ts` `export * from './types.js'` as the sole external surface: `packages/kanban/package.json` has no `./types` subpath, so sibling packages reach these types only via the `@wrongstack/kanban` root barrel.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/kanban/src/types.ts`
  - *How:* `from ['"](\.{1,2}/)+types\.js['"]`
  - *How:* `codebase-incoming-calls`
  - *How:* `supervision-types.js`
  - *How:* `task-policy-types.js`
  - *How:* `verification-types.js`
  - *How:* `types-contract-graph.js`
  - *How:* `types`
  - *How:* `packages/kanban/src/index.ts`
  - *How:* `export * from './types.js'`
  - *How:* `packages/kanban/package.json`
  - *How:* `./types`
  - *How:* `@wrongstack/kanban`
  - *How:* `./types.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T07:50:43.086Z; skill=codebase-navigation; applied=10; wins=10; skipped=17; skippedWins=16 -->
- **Always close consumers of `packages/sage/src/sqlite-store-hygiene.ts` with a specifier grep (`.js`-suffixed) plus a bare-token grep, never `codebase-incoming-calls` on the wrapper `hygiene`: the symbol name is generic enough that the call graph includes unpinnable noise (the `hygiene` config parameter in `packages/sage/src/host-wiring.ts`, an unrelated core test). The dedicated regression tests (`packages/sage/tests/sqlite-store-hygiene-*-toctou.test.ts`) reach the module through `SqliteMemoryPort` (`../src/memory-port.js`) with no import edge, and the only real importer is `packages/sage/src/sqlite-store-graph-write.ts:8`, surfaced publicly as `SqliteSageStore.hygiene()` in `packages/sage/src/sqlite-store.ts`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/sqlite-store-hygiene.ts`
  - *How:* `.js`
  - *How:* `codebase-incoming-calls`
  - *How:* `hygiene`
  - *How:* `packages/sage/src/host-wiring.ts`
  - *How:* `packages/sage/tests/sqlite-store-hygiene-*-toctou.test.ts`
  - *How:* `SqliteMemoryPort`
  - *How:* `../src/memory-port.js`
  - *How:* `packages/sage/src/sqlite-store-graph-write.ts:8`
  - *How:* `SqliteSageStore.hygiene()`
  - *How:* `packages/sage/src/sqlite-store.ts`
  - *How:* `packages/sage/src/sqlite-store-graph-write.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T09:07:58.972Z; skill=codebase-navigation; applied=6; wins=6; skipped=2; skippedWins=1 -->
- **Always close consumers of a `packages/webui-hq/src/views/<name>/index.tsx` view module with a repo-wide exported-symbol grep (`FleetMapView`) plus a specifier grep (`views/<name>(/index)?\.js`), never `codebase-incoming-calls` alone: wiring is exclusively `lazy(() => import('../../views/<name>/index.js'))` entries in `packages/webui-hq/src/components/hq/view-router.tsx` (`HQ_VIEW_COMPONENTS: Record<HqViewId, ...>` — Record exhaustiveness makes a missing entry a compile error), plus a parallel dynamic-import table in `packages/webui-hq/tests/components/views-smoke.test.tsx` that stubs `ResizeObserver` for React Flow. The view-key string (e.g. `'fleet'`) is the real public contract; keep `@xyflow/react` imports inside the lazy chunk per the router's chunking comment.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-hq/src/views/<name>/index.tsx`
  - *How:* `FleetMapView`
  - *How:* `views/<name>(/index)?\.js`
  - *How:* `codebase-incoming-calls`
  - *How:* `lazy(() => import('../../views/<name>/index.js'))`
  - *How:* `packages/webui-hq/src/components/hq/view-router.tsx`
  - *How:* `HQ_VIEW_COMPONENTS: Record<HqViewId, ...>`
  - *How:* `packages/webui-hq/tests/components/views-smoke.test.tsx`
  - *How:* `ResizeObserver`
  - *How:* `'fleet'`
  - *How:* `@xyflow/react`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T09:28:33.576Z; skill=codebase-navigation -->
- **Always close consumers of a `packages/webui-hq/tests/*.test.ts(x)` spec via the root `vitest.config.ts` include glob (`packages/**/tests/**/*.test.{ts,tsx}` — webui-hq is NOT excluded, unlike `packages/webui/tests/**` subdirs) plus the package `tsconfig.test.json` (`include: ["src/**/*", "tests/**/*"]`), never `codebase-incoming-calls`: the package has no local `vitest.config.ts` (its `"test": "vitest run"` runs config-less defaults), and root coverage explicitly excludes `packages/webui-hq/src/**` with aggregate `perFile:false` thresholds, so coverage gates are never part of a webui-hq spec's blast radius — unlike the webui-server pattern.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-hq/tests/*.test.ts(x)`
  - *How:* `vitest.config.ts`
  - *How:* `packages/**/tests/**/*.test.{ts,tsx}`
  - *How:* `packages/webui/tests/**`
  - *How:* `tsconfig.test.json`
  - *How:* `include: ["src/**/*", "tests/**/*"]`
  - *How:* `codebase-incoming-calls`
  - *How:* `"test": "vitest run"`
  - *How:* `packages/webui-hq/src/**`
  - *How:* `perFile:false`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T06:18:39.213Z; skill=codebase-navigation; applied=14; wins=14; skipped=37; skippedWins=36 -->
- **Always close consumers of a `packages/webui/src/components/*View.tsx` route-style component with a repo-wide bare-symbol grep, never a static-import specifier grep or `codebase-incoming-calls` alone: these views are wired exclusively through dynamic `import('./XView').then((m) => ({ default: m.XView }))` entries in `packages/webui/src/components/view-registry.ts`, which the call graph reports as zero callers and `from ['"]...XView['"]` misses by construction. The registry entry (view key, `boundaryNameKey`, `props`) is the real public contract; side-panel siblings reference the view only in comments (view-state navigation coupling, no import edge).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui/src/components/*View.tsx`
  - *How:* `codebase-incoming-calls`
  - *How:* `import('./XView').then((m) => ({ default: m.XView }))`
  - *How:* `packages/webui/src/components/view-registry.ts`
  - *How:* `from ['"]...XView['"]`
  - *How:* `boundaryNameKey`
  - *How:* `props`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T20:54:20.591Z; skill=codebase-navigation; applied=1; wins=1; skipped=93; skippedWins=92 -->
- **Always disambiguate `EFFORT_KEEP` by import specifier, never by symbol name, when closing consumers of `packages/cli/src/picker-effort.ts`: `packages/tui/src/components/model-picker-effort.ts` exports its own same-named `EFFORT_KEEP` with the same sentinel semantics, and a bare symbol grep returns ~10 TUI files that have no import edge to the CLI module. Close with a module-path grep (`picker-effort\.js`) scoped to the import specifier, and treat the pair as behavioral twins (semantic edits in one may warrant a matching change in the other) rather than one shared implementation.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `EFFORT_KEEP`
  - *How:* `packages/cli/src/picker-effort.ts`
  - *How:* `packages/tui/src/components/model-picker-effort.ts`
  - *How:* `picker-effort\.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:16:11.746Z; skill=codebase-navigation; applied=54; wins=54; skipped=90; skippedWins=89 -->
- **Always disambiguate the four same-named `AGENTS.md` files in WrongStack before reporting consumers: `.wrongstack/AGENTS.md` (project memory, accessor `WstackPaths.inProjectAgentsFile` in `packages/core/src/utils/wstack-paths.ts`), root `AGENTS.md`/`CLAUDE.md` (repo instructions via `system-prompt-builder.ts`), `~/.wrongstack/AGENTS.md` (user instructions), and subdirectory `<dir>/AGENTS.md` (directory instructions). Close the project-memory file's dependents with an untruncated grep on `inProjectAgentsFile` plus the literal `.wrongstack/AGENTS.md` — never a bare `AGENTS\.md` filename grep, which conflates all four and returns 190+ hits. - **What:** grep the accessor symbol, not the filename, for `.wrongstack/AGENTS.md` consumers. - **Why:** the filename stem matches four unrelated files and truncates before closure. - **How:** `grep inProjectAgentsFile` (11 untruncated hits) + `grep '\.wrongstack/AGENTS\.md'` in `packages/core/src` and `packages/cli/src`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `AGENTS.md`
  - *How:* `.wrongstack/AGENTS.md`
  - *How:* `WstackPaths.inProjectAgentsFile`
  - *How:* `packages/core/src/utils/wstack-paths.ts`
  - *How:* `CLAUDE.md`
  - *How:* `system-prompt-builder.ts`
  - *How:* `~/.wrongstack/AGENTS.md`
  - *How:* `<dir>/AGENTS.md`
  - *How:* `inProjectAgentsFile`
  - *How:* `AGENTS\.md`
  - *How:* `grep inProjectAgentsFile`
  - *How:* `grep '\.wrongstack/AGENTS\.md'`
  - *How:* `packages/core/src`
  - *How:* `packages/cli/src`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:51:24.662Z; skill=codebase-navigation; applied=29; wins=29; skipped=134; skippedWins=133 -->
- **Always flag post-edit state explicitly when a probe reports the leader edited a file without reading it: for untracked, gitignored scratch files (`.temp_files/**`) there is no pre-edit baseline in git, so the captured read is the surviving record — say so rather than implying a before/after comparison. Close such a file's consumers with a repo-wide tracked grep of the full filename, and never use `glob` for existence or sibling closure under `.temp_files/`: it honors ignore rules and returns false zeros even with an explicit `.temp_files/...` pattern while a direct `read` proves the file exists.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/**`
  - *How:* `glob`
  - *How:* `.temp_files/`
  - *How:* `.temp_files/...`
  - *How:* `read`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T07:14:08.493Z; skill=codebase-navigation; applied=9; wins=9; skipped=23; skippedWins=22 -->
- **Always include a WrongStack package's coverage gate when reporting a test file's blast radius: specs with zero source importers are still the only consumers keeping `packages/*/vitest.config.ts` `coverage.thresholds` (e.g. webui-server's 78/76/69/66 over `src/**` minus entry barrels) green, so deleting or weakening a spec can fail the package run even when the untruncated stem grep proves no code depends on it. Pair the closure with `tsconfig.test.json` (`include` of `tests/**/*`) to catch the type gate, and check whether test helpers rely on load-bearing `as never`/`as unknown` casts that bypass the real options type.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/*/vitest.config.ts`
  - *How:* `coverage.thresholds`
  - *How:* `src/**`
  - *How:* `tsconfig.test.json`
  - *How:* `include`
  - *How:* `tests/**/*`
  - *How:* `as never`
  - *How:* `as unknown`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:18:25.222Z; applied=22; wins=22; skipped=163; skippedWins=162 -->
- **Always verify `vi.mock('../src/.../<module>.js')` specifiers against the live import path when closing dependents of a WrongStack slash-command module: renamed modules leave stale mocks behind (e.g. `packages/cli/tests/kanban-slash-coverage.test.ts` mocks `kanban-task.js` while `packages/cli/src/slash-commands/kanban.ts` imports `./kanban-task-subcommands.js`), so a symbol grep hit in a test can indicate a mock that never intercepts anything — confirm with a filename glob over `packages/cli/src/slash-commands/` before counting that test as a dependent.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `vi.mock('../src/.../<module>.js')`
  - *How:* `packages/cli/tests/kanban-slash-coverage.test.ts`
  - *How:* `kanban-task.js`
  - *How:* `packages/cli/src/slash-commands/kanban.ts`
  - *How:* `./kanban-task-subcommands.js`
  - *How:* `packages/cli/src/slash-commands/`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T11:50:12.264Z; skill=codebase-navigation; applied=57; wins=57; skipped=152; skippedWins=151 -->
- **Before trusting a WrongStack core module's header comment claiming it is the "single shared" implementation used by every surface, verify by repo-wide import-edge grep of its exported symbols (e.g. `resolveRefinerTargetSpec|RefinerTargetSpec|RefinerTargetSource`): parallel implementations can persist with no import edge (`packages/core/src/execution/refiner-target.ts` claims goal/mission refinement uses it, but `packages/core/src/goal/mission-refinement.ts` re-implements the same precedence inline with a `favoriteModels` allow-list). Treat `codebase-impact-analysis` HIGH-risk ratings on core symbols as transitive barrel-closure noise when `totalCallSites=0` direct — anchor blast radius with `codebase-incoming-calls` plus one untruncated symbol grep instead.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `resolveRefinerTargetSpec|RefinerTargetSpec|RefinerTargetSource`
  - *How:* `packages/core/src/execution/refiner-target.ts`
  - *How:* `packages/core/src/goal/mission-refinement.ts`
  - *How:* `favoriteModels`
  - *How:* `codebase-impact-analysis`
  - *How:* `totalCallSites=0`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T21:23:38.005Z; skill=codebase-navigation; applied=2; wins=2; skipped=81; skippedWins=80 -->
- **Classify `~/.wrongstack/tool-output/<ISO-timestamp>-<tool>-<uuid>.log` files as command-output spool artifacts, never modules: zero exports/importers by construction, producer is `packages/tools/src/_output-spool.ts` (`createOutputSpool`/`finishCommandOutput`, called only from `packages/tools/src/bash-stream.ts` and `packages/tools/src/exec.ts`), and the `read` tool accepts these absolute home-directory paths — read the log directly (L1 carries the command + exit metadata) instead of searching the repo for the filename. When such a log holds a `git diff`, report the touched modules' live state and close symbol consumers separately; the diff's path filter may omit sibling files a commit also changed.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `~/.wrongstack/tool-output/<ISO-timestamp>-<tool>-<uuid>.log`
  - *How:* `packages/tools/src/_output-spool.ts`
  - *How:* `createOutputSpool`
  - *How:* `finishCommandOutput`
  - *How:* `packages/tools/src/bash-stream.ts`
  - *How:* `packages/tools/src/exec.ts`
  - *How:* `read`
  - *How:* `git diff`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:32:15.082Z; skill=codebase-navigation; applied=78; wins=78; skipped=56; skippedWins=55 -->
- **Classify `architecture/*.json` baselines in WrongStack (`test-only-exports.json`, `core-public-api-snapshot.json`, `exceptions.json`, `hotspots.json`) as data ratchets, not modules: they have no importable symbols, so close consumers with a repo-wide filename-token grep at `truncated=false`, never `codebase-incoming-calls`. Producer is the guarding script's `--write` mode under `scripts/`, reader is `loadArchitectureInputs` in `scripts/lib/architecture-health.mjs`, and the invocation chain is root `package.json` `check:architecture` / `check:architecture:sync`. Comment/doc hits naming the file are evidence of recorded entries, not runtime consumers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `architecture/*.json`
  - *How:* `test-only-exports.json`
  - *How:* `core-public-api-snapshot.json`
  - *How:* `exceptions.json`
  - *How:* `hotspots.json`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`
  - *How:* `--write`
  - *How:* `scripts/`
  - *How:* `loadArchitectureInputs`
  - *How:* `scripts/lib/architecture-health.mjs`
  - *How:* `package.json`
  - *How:* `check:architecture`
  - *How:* `check:architecture:sync`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T08:07:58.245Z; skill=codebase-navigation; applied=3; wins=3; skipped=12; skippedWins=11 -->
- **Classify a proof round by its config filename and directory contents before predicting its runner: `.temp_files/proof-driven-bug-hunter/<round>/vitest.proof.config.mjs` (ESM, no TS transpile) with no sibling `run.mjs` means the only consumer is a manual `pnpm exec vitest run -c <config>` from repo root — close consumers with an untruncated grep of the full round-directory name, never `codebase-incoming-calls`. When mapping edit blast radius for such a config, the load-bearing lines are the `dirname`-chain depth pinning `root` to repo root (mirrored by the proof test's `../../../packages/...` relative imports) and any `replaceAll('\\', '/')` normalization feeding an absolute `test.include` glob on Windows.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/vitest.proof.config.mjs`
  - *How:* `run.mjs`
  - *How:* `pnpm exec vitest run -c <config>`
  - *How:* `codebase-incoming-calls`
  - *How:* `dirname`
  - *How:* `root`
  - *How:* `../../../packages/...`
  - *How:* `replaceAll('\\', '/')`
  - *How:* `test.include`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:56:12.075Z; skill=codebase-navigation; applied=59; wins=59; skipped=100; skippedWins=99 -->
- **Never trust a WrongStack module header comment as evidence of consumers: close it with a repo-wide module-path token grep plus an exported-symbol alternation grep. New scaffolding modules can carry aspirational wiring claims with zero importers (e.g. `packages/core/src/execution/refine-decisions.ts` claims a `@wrongstack/core/execution` barrel re-export and a WebUI subpath consumer, but `packages/core/src/execution/index.ts` omits the module and only `packages/core/package.json` names the path). Also treat same-named types in sibling packages (TUI's local `RefineFailureDecision`) as name collisions until an import edge is shown — a files-with-match hit on a type name is not a dependency.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/execution/refine-decisions.ts`
  - *How:* `@wrongstack/core/execution`
  - *How:* `packages/core/src/execution/index.ts`
  - *How:* `packages/core/package.json`
  - *How:* `RefineFailureDecision`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:45:21.163Z; skill=codebase-navigation; applied=27; wins=27; skipped=104; skippedWins=103 -->
- **Treat `protocolHandlerCoverage` in `packages/acp/src/agent/protocol-handler.ts` as a test-only export seam consumed solely by `packages/acp/tests/protocol-handler.test.ts` (the per-file coverage suite behind the 99.8/100/98.5 thresholds in `packages/acp/vitest.config.ts`) — removing or renaming it breaks that suite only, never runtime importers; close its consumers with a test-filename grep, not `codebase-incoming-calls`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `protocolHandlerCoverage`
  - *How:* `packages/acp/src/agent/protocol-handler.ts`
  - *How:* `packages/acp/tests/protocol-handler.test.ts`
  - *How:* `packages/acp/vitest.config.ts`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T17:09:06.615Z; skipped=123; skippedWins=122 -->
- **When the project `grep` tool reports `count=N` but `showing 3` in content mode, do not re-run pattern variants to surface the rest — the display is capped at ~3 matches per file regardless of pattern. Enumerate the full match set (e.g. every `it(...)` title in a vitest file) with one `read` of the enclosing line range, anchored by the line numbers grep already returned.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `grep`
  - *How:* `count=N`
  - *How:* `showing 3`
  - *How:* `it(...)`
  - *How:* `read`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:20:59.408Z; skill=codebase-navigation; applied=44; wins=44; skipped=139; skippedWins=138 -->
- **Always close WrongStack CLI subcommand-handler dependents with a repo-wide filename-stem grep, not `codebase-incoming-calls`: `packages/cli/src/subcommands/index.ts` wires every handler through lazy `async () => (await import('./handlers/<name>.js')).<name>Cmd` registry entries, which the call graph reports as zero direct callers. The stem grep plus a per-file check of imported symbols separates real importers (e.g. three test files importing `modeldiagCmd`) from sibling-module and help-text near-misses (`modeldiag-eval.js`, `per-subcommand-help-table.ts`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `packages/cli/src/subcommands/index.ts`
  - *How:* `async () => (await import('./handlers/<name>.js')).<name>Cmd`
  - *How:* `modeldiagCmd`
  - *How:* `modeldiag-eval.js`
  - *How:* `per-subcommand-help-table.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:09:29.458Z; skill=codebase-navigation; applied=46; wins=46; skipped=148; skippedWins=147 -->
- **Always confirm `codebase-incoming-calls` attribution of a constructor call site with a targeted `read` when the reported enclosing symbol is implausible — the index attached `new SessionSummaryTracker(...)` at `packages/core/src/storage/file-session-writer.ts:262` to `recordSideEffect` (a method defined at L186), when the call is actually `FileSessionWriter` constructor wiring. Treat call-graph "caller" fields as nearest-symbol guesses, not verified enclosures, before naming a caller in a report.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `read`
  - *How:* `new SessionSummaryTracker(...)`
  - *How:* `packages/core/src/storage/file-session-writer.ts:262`
  - *How:* `recordSideEffect`
  - *How:* `FileSessionWriter`
  - *How:* `packages/core/src/storage/file-session-writer.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:45:31.179Z; skill=codebase-navigation; applied=89; wins=89; skipped=124; skippedWins=123 -->
- **Always disambiguate sibling-relative imports of generically named stems (`fix.ts`, `index.ts`, `tools.ts`) by the imported symbols, not just the specifier: `from './fix.js'` matched `packages/cli/src/slash-commands/index.ts` (importing `buildFixCommand`) as a false positive while closing consumers of `packages/tools/src/dead-code/fix.ts`. Verify each hit's imported names against the target file's export list before counting it.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `fix.ts`
  - *How:* `index.ts`
  - *How:* `tools.ts`
  - *How:* `from './fix.js'`
  - *How:* `packages/cli/src/slash-commands/index.ts`
  - *How:* `buildFixCommand`
  - *How:* `packages/tools/src/dead-code/fix.ts`
  - *How:* `./fix.js`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:49:23.044Z; skill=codebase-navigation; applied=56; wins=56; skipped=109; skippedWins=108 -->
- **Always disambiguate WrongStack's near-twin script names by full filename, not stem prefix: `scripts/snapshot-core-public-api.mjs` (generator, run by npm `check:architecture`) and `scripts/sync-core-public-api-snapshot.mjs` (pre-commit guard, run by `.githooks/pre-commit`) differ only in word order. When closing consumers of one, grep the exact full filename and verify each hit's role — a loose `snapshot` or `core-public-api` stem conflates the two, and root `package.json` references only the generator while `.githooks/pre-commit` references only the guard.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `scripts/snapshot-core-public-api.mjs`
  - *How:* `check:architecture`
  - *How:* `scripts/sync-core-public-api-snapshot.mjs`
  - *How:* `.githooks/pre-commit`
  - *How:* `snapshot`
  - *How:* `core-public-api`
  - *How:* `package.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T13:02:55.780Z; skill=codebase-navigation; applied=58; wins=58; skipped=98; skippedWins=97 -->
- **Treat previously captured "zero importers / aspirational wiring" findings about a module as stale on every new contact: re-run the module-path token grep plus exported-symbol alternation grep before repeating the old conclusion. Scaffolding modules acquire real consumers between sessions — `packages/core/src/execution/refine-decisions.ts` went from barrel-omitted with only `packages/core/package.json` naming the path, to fully wired (barrel re-export in `packages/core/src/execution/index.ts`, TUI consumer via `@wrongstack/core/execution`, WebUI consumer via the narrow subpath, build entry in `scripts/build-package.mjs`) with tests green. Also: when a probed symbol has same-named local types in sibling packages (TUI's local `RefineFailureDecision`), separate "imports core's type" from "declares its own" by reading the import block's source module before counting a grep hit as a dependent.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/execution/refine-decisions.ts`
  - *How:* `packages/core/package.json`
  - *How:* `packages/core/src/execution/index.ts`
  - *How:* `@wrongstack/core/execution`
  - *How:* `scripts/build-package.mjs`
  - *How:* `RefineFailureDecision`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:45:08.905Z; skill=codebase-navigation; applied=108; wins=108; skipped=106; skippedWins=105 -->
- **When probing a WrongStack CLI slash-command module for dependents, always check `packages/webui-server/src/server/` for a same-named `*-adapter.ts` before assuming a shared code path: these adapters re-implement CLI behavior against `@wrongstack/core/*` directly (e.g. `goal-refiner-adapter.ts` mirrors `goal-refiner.ts`'s fallback order via `refineGoalWithProvider` from `@wrongstack/core/goal`) rather than importing the CLI module — so behavioral coupling exists with no import edge, and a stem-only consumer grep will show the adapter while a symbol-only grep would miscount it as a dependent.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/`
  - *How:* `*-adapter.ts`
  - *How:* `@wrongstack/core/*`
  - *How:* `goal-refiner-adapter.ts`
  - *How:* `goal-refiner.ts`
  - *How:* `refineGoalWithProvider`
  - *How:* `@wrongstack/core/goal`
  - *How:* `@wrongstack/core`

---
*Last capture: 2026-10-07T09:28:33.576Z · 25 entries*
