# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:59:23.484Z; skill=codebase-navigation; applied=16; wins=16; skipped=11; skippedWins=11 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:06:15.607Z; skill=codebase-navigation; applied=39; wins=39; skipped=27; skippedWins=27 -->
- **Always classify a core type module as caller-less before running `codebase-incoming-calls`: when every export is an `interface` (e.g. `packages/core/src/types/one-shot-llm.ts`), the call graph is empty by construction and the real consumer closure is a repo-wide exported-symbol grep plus a file-stem grep. Include inline type expressions in the symbol pass — cross-package consumers can reach core types through `import('@wrongstack/core/types').SomeOption['field']` (as `packages/cli/src/wiring/provider-utility-tools.ts` does), which a file-stem search never catches.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `codebase-incoming-calls`
  - *How:* `interface`
  - *How:* `packages/core/src/types/one-shot-llm.ts`
  - *How:* `import('@wrongstack/core/types').SomeOption['field']`
  - *How:* `packages/cli/src/wiring/provider-utility-tools.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:16:11.746Z; skill=codebase-navigation; applied=9; wins=9; skipped=4; skippedWins=4 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:51:24.662Z; skill=codebase-navigation; applied=7; wins=7; skipped=25; skippedWins=25 -->
- **Always flag post-edit state explicitly when a probe reports the leader edited a file without reading it: for untracked, gitignored scratch files (`.temp_files/**`) there is no pre-edit baseline in git, so the captured read is the surviving record — say so rather than implying a before/after comparison. Close such a file's consumers with a repo-wide tracked grep of the full filename, and never use `glob` for existence or sibling closure under `.temp_files/`: it honors ignore rules and returns false zeros even with an explicit `.temp_files/...` pattern while a direct `read` proves the file exists.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/**`
  - *How:* `glob`
  - *How:* `.temp_files/`
  - *How:* `.temp_files/...`
  - *How:* `read`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:18:25.222Z; applied=5; wins=5; skipped=49; skippedWins=49 -->
- **Always verify `vi.mock('../src/.../<module>.js')` specifiers against the live import path when closing dependents of a WrongStack slash-command module: renamed modules leave stale mocks behind (e.g. `packages/cli/tests/kanban-slash-coverage.test.ts` mocks `kanban-task.js` while `packages/cli/src/slash-commands/kanban.ts` imports `./kanban-task-subcommands.js`), so a symbol grep hit in a test can indicate a mock that never intercepts anything — confirm with a filename glob over `packages/cli/src/slash-commands/` before counting that test as a dependent.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `vi.mock('../src/.../<module>.js')`
  - *How:* `packages/cli/tests/kanban-slash-coverage.test.ts`
  - *How:* `kanban-task.js`
  - *How:* `packages/cli/src/slash-commands/kanban.ts`
  - *How:* `./kanban-task-subcommands.js`
  - *How:* `packages/cli/src/slash-commands/`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T11:50:12.264Z; skill=codebase-navigation; applied=30; wins=30; skipped=48; skippedWins=48 -->
- **Before trusting a WrongStack core module's header comment claiming it is the "single shared" implementation used by every surface, verify by repo-wide import-edge grep of its exported symbols (e.g. `resolveRefinerTargetSpec|RefinerTargetSpec|RefinerTargetSource`): parallel implementations can persist with no import edge (`packages/core/src/execution/refiner-target.ts` claims goal/mission refinement uses it, but `packages/core/src/goal/mission-refinement.ts` re-implements the same precedence inline with a `favoriteModels` allow-list). Treat `codebase-impact-analysis` HIGH-risk ratings on core symbols as transitive barrel-closure noise when `totalCallSites=0` direct — anchor blast radius with `codebase-incoming-calls` plus one untruncated symbol grep instead.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `resolveRefinerTargetSpec|RefinerTargetSpec|RefinerTargetSource`
  - *How:* `packages/core/src/execution/refiner-target.ts`
  - *How:* `packages/core/src/goal/mission-refinement.ts`
  - *How:* `favoriteModels`
  - *How:* `codebase-impact-analysis`
  - *How:* `totalCallSites=0`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:32:15.082Z; skill=codebase-navigation; applied=1; wins=1; skipped=2; skippedWins=2 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T12:56:12.075Z; skill=codebase-navigation; applied=11; wins=11; skipped=17; skippedWins=17 -->
- **Never trust a WrongStack module header comment as evidence of consumers: close it with a repo-wide module-path token grep plus an exported-symbol alternation grep. New scaffolding modules can carry aspirational wiring claims with zero importers (e.g. `packages/core/src/execution/refine-decisions.ts` claims a `@wrongstack/core/execution` barrel re-export and a WebUI subpath consumer, but `packages/core/src/execution/index.ts` omits the module and only `packages/core/package.json` names the path). Also treat same-named types in sibling packages (TUI's local `RefineFailureDecision`) as name collisions until an import edge is shown — a files-with-match hit on a type name is not a dependency.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/execution/refine-decisions.ts`
  - *How:* `@wrongstack/core/execution`
  - *How:* `packages/core/src/execution/index.ts`
  - *How:* `packages/core/package.json`
  - *How:* `RefineFailureDecision`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-06T15:45:21.163Z; skill=codebase-navigation -->
- **Treat `protocolHandlerCoverage` in `packages/acp/src/agent/protocol-handler.ts` as a test-only export seam consumed solely by `packages/acp/tests/protocol-handler.test.ts` (the per-file coverage suite behind the 99.8/100/98.5 thresholds in `packages/acp/vitest.config.ts`) — removing or renaming it breaks that suite only, never runtime importers; close its consumers with a test-filename grep, not `codebase-incoming-calls`.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `protocolHandlerCoverage`
  - *How:* `packages/acp/src/agent/protocol-handler.ts`
  - *How:* `packages/acp/tests/protocol-handler.test.ts`
  - *How:* `packages/acp/vitest.config.ts`
  - *How:* `codebase-incoming-calls`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:27:08.952Z; skill=codebase-navigation; applied=8; wins=8; skipped=39; skippedWins=39 -->
- **Always anchor import-closure greps to the full specifier with the `.js` suffix (`from ['"][^'"]*<stem>\.js['"]`) when a module belongs to a same-prefix file family — in `packages/webui-server/src/server/`, the `start-webui-*` helpers made a bare `start-webui` stem grep return 46 files (46 → 3 real importers), because sibling helpers, their tests, and docs all match the prefix without importing the module.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.js`
  - *How:* `from ['"][^'"]*<stem>\.js['"]`
  - *How:* `packages/webui-server/src/server/`
  - *How:* `start-webui-*`
  - *How:* `start-webui`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T15:26:54.159Z; skill=codebase-navigation; skipped=4; skippedWins=4 -->
- **Always classify a proof round by both its entry filename *and* its sibling config filename before predicting the runner: `.temp_files/proof-driven-bug-hunter/<round>/` may pair `proof.test.mjs` with `vitest.proof.config.mjs` (not `.ts`) whose `root: import.meta.dirname` + `include: ['proof.test.mjs']` makes the manual `pnpm exec vitest run --config <round>/vitest.proof.config.mjs` invocation CWD-independent — yet the proof's `../../../packages/...` relative import still pins the round exactly three levels below repo root, so moving or renaming either file breaks the harness even though the config looks location-free. Close consumers with one untruncated tracked-scope grep of the full round-directory name; with no exports there are no importers, and the manual vitest command is the entire external contract.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `proof.test.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `.ts`
  - *How:* `root: import.meta.dirname`
  - *How:* `include: ['proof.test.mjs']`
  - *How:* `pnpm exec vitest run --config <round>/vitest.proof.config.mjs`
  - *How:* `../../../packages/...`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:14:49.141Z; skill=codebase-navigation; applied=24; wins=24; skipped=75; skippedWins=75 -->
- **Always classify a proof round by its entry filename before predicting its runner: `.temp_files/proof-driven-bug-hunter/<round>/proof.ts` with a `pnpm exec tsx` header is a standalone harness with no `run.mjs` and no `vitest.proof.config.ts` — root `vitest.config.ts` excludes `'**/.temp_files/**'`, so its blast radius is the manual run only, and its relative `../../../packages/...` dynamic import pins the file exactly three levels below repo root. Verify with an exact-directory `tree`, not by assuming the vitest round shape.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/proof.ts`
  - *How:* `pnpm exec tsx`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.ts`
  - *How:* `vitest.config.ts`
  - *How:* `'**/.temp_files/**'`
  - *How:* `../../../packages/...`
  - *How:* `tree`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:20:59.408Z; skill=codebase-navigation; applied=15; wins=15; skipped=37; skippedWins=37 -->
- **Always close WrongStack CLI subcommand-handler dependents with a repo-wide filename-stem grep, not `codebase-incoming-calls`: `packages/cli/src/subcommands/index.ts` wires every handler through lazy `async () => (await import('./handlers/<name>.js')).<name>Cmd` registry entries, which the call graph reports as zero direct callers. The stem grep plus a per-file check of imported symbols separates real importers (e.g. three test files importing `modeldiagCmd`) from sibling-module and help-text near-misses (`modeldiag-eval.js`, `per-subcommand-help-table.ts`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `packages/cli/src/subcommands/index.ts`
  - *How:* `async () => (await import('./handlers/<name>.js')).<name>Cmd`
  - *How:* `modeldiagCmd`
  - *How:* `modeldiag-eval.js`
  - *How:* `per-subcommand-help-table.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:09:29.458Z; skill=codebase-navigation; applied=17; wins=17; skipped=46; skippedWins=46 -->
- **Always confirm `codebase-incoming-calls` attribution of a constructor call site with a targeted `read` when the reported enclosing symbol is implausible — the index attached `new SessionSummaryTracker(...)` at `packages/core/src/storage/file-session-writer.ts:262` to `recordSideEffect` (a method defined at L186), when the call is actually `FileSessionWriter` constructor wiring. Treat call-graph "caller" fields as nearest-symbol guesses, not verified enclosures, before naming a caller in a report.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `codebase-incoming-calls`
  - *How:* `read`
  - *How:* `new SessionSummaryTracker(...)`
  - *How:* `packages/core/src/storage/file-session-writer.ts:262`
  - *How:* `recordSideEffect`
  - *How:* `FileSessionWriter`
  - *How:* `packages/core/src/storage/file-session-writer.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T15:22:43.316Z; skill=codebase-navigation; applied=1; wins=1; skipped=6; skippedWins=6 -->
- **Always disambiguate `tokenizeCommand` hits in WrongStack before counting them as dependents of `packages/sdd/src/verify-task.ts`: three independent implementations exist (`packages/sdd/src/verify-task.ts`, `packages/cli/src/slash-commands/dev.ts`, `packages/plugins/src/test-flake-detector/index.ts`). A symbol-only grep overcounts — check whether each hit is an import or a local `function` declaration, and close the real set with the import-edge grep `from ['"][^'"]*verify-task(\.js)?['"]` plus `@wrongstack/sdd` barrel consumers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tokenizeCommand`
  - *How:* `packages/sdd/src/verify-task.ts`
  - *How:* `packages/cli/src/slash-commands/dev.ts`
  - *How:* `packages/plugins/src/test-flake-detector/index.ts`
  - *How:* `function`
  - *How:* `from ['"][^'"]*verify-task(\.js)?['"]`
  - *How:* `@wrongstack/sdd`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:45:31.179Z; skill=codebase-navigation; applied=39; wins=39; skipped=43; skippedWins=43 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:49:23.044Z; skill=codebase-navigation; applied=10; wins=10; skipped=24; skippedWins=24 -->
- **Always disambiguate WrongStack's near-twin script names by full filename, not stem prefix: `scripts/snapshot-core-public-api.mjs` (generator, run by npm `check:architecture`) and `scripts/sync-core-public-api-snapshot.mjs` (pre-commit guard, run by `.githooks/pre-commit`) differ only in word order. When closing consumers of one, grep the exact full filename and verify each hit's role — a loose `snapshot` or `core-public-api` stem conflates the two, and root `package.json` references only the generator while `.githooks/pre-commit` references only the guard.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `scripts/snapshot-core-public-api.mjs`
  - *How:* `check:architecture`
  - *How:* `scripts/sync-core-public-api-snapshot.mjs`
  - *How:* `.githooks/pre-commit`
  - *How:* `snapshot`
  - *How:* `core-public-api`
  - *How:* `package.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T12:13:25.998Z; skill=codebase-navigation; applied=8; wins=8; skipped=50; skippedWins=50 -->
- **Always verify a types barrel's transitive re-export chain before claiming a core type is publicly exposed: when the barrel (`packages/core/src/types/index.ts`) re-exports from an intermediate module (`./session.js`) but the symbol's declaring file is a sibling (`./session-storage.js`), confirm the intermediate module has an `export type { … } from './<declaring-file>.js'` block — then close file-level importers with a repo-wide `from ['"][^'"]*<stem>(\.js)?['"]` grep (it will usually return just the intermediate module) and treat the package `exports` map (`packages/core/package.json` `"./types"`) as the real consumer surface.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/types/index.ts`
  - *How:* `./session.js`
  - *How:* `./session-storage.js`
  - *How:* `export type { … } from './<declaring-file>.js'`
  - *How:* `from ['"][^'"]*<stem>(\.js)?['"]`
  - *How:* `exports`
  - *How:* `packages/core/package.json`
  - *How:* `"./types"`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T13:02:55.780Z; skill=codebase-navigation; applied=8; wins=8; skipped=17; skippedWins=17 -->
- **Treat previously captured "zero importers / aspirational wiring" findings about a module as stale on every new contact: re-run the module-path token grep plus exported-symbol alternation grep before repeating the old conclusion. Scaffolding modules acquire real consumers between sessions — `packages/core/src/execution/refine-decisions.ts` went from barrel-omitted with only `packages/core/package.json` naming the path, to fully wired (barrel re-export in `packages/core/src/execution/index.ts`, TUI consumer via `@wrongstack/core/execution`, WebUI consumer via the narrow subpath, build entry in `scripts/build-package.mjs`) with tests green. Also: when a probed symbol has same-named local types in sibling packages (TUI's local `RefineFailureDecision`), separate "imports core's type" from "declares its own" by reading the import block's source module before counting a grep hit as a dependent.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/execution/refine-decisions.ts`
  - *How:* `packages/core/package.json`
  - *How:* `packages/core/src/execution/index.ts`
  - *How:* `@wrongstack/core/execution`
  - *How:* `scripts/build-package.mjs`
  - *How:* `RefineFailureDecision`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:37:44.905Z; skill=codebase-navigation; applied=25; wins=25; skipped=62; skippedWins=62 -->
- **When a probe asks "who imports X.test.ts(x)", expect zero source importers by construction: close it with one repo-wide untruncated filename-stem grep, then cite the owning package's `vitest.config.ts` project `include` glob as the actual consumer (e.g. `packages/webui/vitest.config.ts` `browser-jsdom` project, `tests/**/*.test.tsx`). Treat a `docs/reports/architecture-health-current.json` hit as inventory metadata only — it can be stale (it listed project `webui-jsdom` where the live config says `browser-jsdom`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.config.ts`
  - *How:* `include`
  - *How:* `packages/webui/vitest.config.ts`
  - *How:* `browser-jsdom`
  - *How:* `tests/**/*.test.tsx`
  - *How:* `docs/reports/architecture-health-current.json`
  - *How:* `webui-jsdom`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T11:45:08.905Z; skill=codebase-navigation; applied=47; wins=47; skipped=36; skippedWins=36 -->
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

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-06T11:34:15.860Z; skill=codebase-navigation; applied=63; wins=63; skipped=27; skippedWins=27 -->
- **Always close WrongStack core-module consumers by symbol name, not file stem: `packages/core/src/execution/index.ts` and `packages/core/src/public-execution.ts` re-export **different subsets** of a module's exports (e.g. `execution/index.ts` omits `ENHANCER_SYSTEM_PROMPT` and `completeRefinerPass` while `public-execution.ts` includes them), and TUI/CLI/webui-server import via `@wrongstack/core/execution` without ever naming the source file. A stem-only grep undercounts real dependents; run a repo-wide exported-symbol alternation (e.g. `enhanceUserPrompt|shouldEnhance|recentTextTurns`) in `**/*.{ts,tsx}` at `truncated=false` to get the true closure. Keep `grep` alternation patterns under 256 characters — the tool rejects longer patterns with a validation error. Split large symbol-closure searches into two shorter alternations rather than one exhaustive pattern; per-file `path`-scoped greps are the cheap way to disambiguate comment mentions from real imports.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/core/src/execution/index.ts`
  - *How:* `packages/core/src/public-execution.ts`
  - *How:* `execution/index.ts`
  - *How:* `ENHANCER_SYSTEM_PROMPT`
  - *How:* `completeRefinerPass`
  - *How:* `public-execution.ts`
  - *How:* `@wrongstack/core/execution`
  - *How:* `enhanceUserPrompt|shouldEnhance|recentTextTurns`
  - *How:* `**/*.{ts,tsx}`
  - *How:* `truncated=false`
  - *How:* `grep`
  - *How:* `path`
  - *How:* `@wrongstack/core`

## Project facts

<!-- learned-stamp: category=fact; capturedAt=2026-10-06T14:10:52.292Z; skill=codebase-navigation; applied=5; wins=5; skipped=12; skippedWins=12 -->
- **Close the blast radius of a zero-export top-level `.mjs` scratch harness under `.temp_files/` with two untruncated tracked-scope greps: the filename stem *and* its distinctive console marker strings (e.g. `FINAL_DIRTY|QUIET at attempt`-style verdict lines) — wrappers can key on output markers rather than the filename, and a filename-only grep misses them. With no exports there are no importers by construction; report the manual `node` invocation as the only consumer, and treat the exit-code/marker pair as the script's entire external contract.**
  - *Why:* Current state of the project — assumed by other conventions, build steps, or peers, so acting on a stale assumption wastes a cycle.
  - *How:* `.mjs`
  - *How:* `.temp_files/`
  - *How:* `FINAL_DIRTY|QUIET at attempt`
  - *How:* `node`

---
*Last capture: 2026-10-06T15:45:21.163Z · 23 entries*
