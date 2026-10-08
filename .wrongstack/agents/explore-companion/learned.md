# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T15:12:43.168Z; skill=codebase-navigation; applied=15; wins=15; skipped=12; skippedWins=12 -->
- **Always answer "callers/dependents of a `*.test.ts` spec" in this repo with three converging checks instead of call graphs: a zero-export grep (`^export |module.exports|exports\.`) in the file, a repo-wide `<stem>\.test` grep (expect only `architecture/*.json` ratchet entries like `core-public-api-usage.json` — these record the spec's `@wrongstack/core/*` imports and re-sync via `check:architecture`), and the collecting root `vitest.config.ts` include (`packages/**/tests/**/*.test.{ts,tsx}`). Report the module-under-test's separate consumer set only as context, never as the spec's importers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `*.test.ts`
  - *How:* `^export |module.exports|exports\.`
  - *How:* `<stem>\.test`
  - *How:* `architecture/*.json`
  - *How:* `core-public-api-usage.json`
  - *How:* `@wrongstack/core/*`
  - *How:* `check:architecture`
  - *How:* `vitest.config.ts`
  - *How:* `packages/**/tests/**/*.test.{ts,tsx}`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:49:16.696Z; skill=codebase-navigation; applied=22; wins=22; skipped=88; skippedWins=88 -->
- **Always check for env-var-driven test seams when closing consumers of `packages/sage/src/project-server-*.ts` helper modules: `packages/sage/tests/project-server-slow-op.test.ts` exercises `createSlowOperationReporter` only by spawning the daemon with `WRONGSTACK_SAGE_SLOW_OP_MS: '0'` and asserting stderr, never by importing `project-server-slow-ops.js` — a module-stem grep alone reports zero test importers while behavior is still ratcheted. Close such modules with a module-stem grep plus exported-symbol grep plus a full barrel read (`packages/sage/src/index.ts` re-exports nothing from this module, making it internal-only).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/project-server-*.ts`
  - *How:* `packages/sage/tests/project-server-slow-op.test.ts`
  - *How:* `createSlowOperationReporter`
  - *How:* `WRONGSTACK_SAGE_SLOW_OP_MS: '0'`
  - *How:* `project-server-slow-ops.js`
  - *How:* `packages/sage/src/index.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T07:22:07.712Z; skill=codebase-navigation; applied=4; wins=4; skipped=52; skippedWins=52 -->
- **Always classify repo-wide symbol-grep hits for `packages/sdd` class names as potential **domain-glossary terms before reporting them as consumers**: names like `SddBoardProjector` are registered in `packages/sage/src/domain-term-candidates.ts` / `domain-term-extractor.ts` and ratcheted by `packages/core/tests/core/system-prompt-glossary.test.ts` and `packages/cli/tests/wiring/domain-glossary.test.ts` — these files match a symbol-name grep but never import the module, and a class rename would break those glossary tests. Close real consumers with a module-stem grep (import specifiers) plus the package barrel (`packages/sdd/src/index.ts`), then treat remaining symbol-only hits as glossary/docs.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sdd`
  - *How:* `SddBoardProjector`
  - *How:* `packages/sage/src/domain-term-candidates.ts`
  - *How:* `domain-term-extractor.ts`
  - *How:* `packages/core/tests/core/system-prompt-glossary.test.ts`
  - *How:* `packages/cli/tests/wiring/domain-glossary.test.ts`
  - *How:* `packages/sdd/src/index.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T22:09:54.833Z; skill=codebase-navigation; applied=28; wins=28; skipped=169; skippedWins=169 -->
- **Always close callers of `packages/webui-server/src/server/*` modules with a symbol-name grep, not just the module stem: CLI hosts reach them through the `@wrongstack/webui-server` package barrel and the `packages/cli/src/webui-server/static-serve.ts` facade (e.g. the only production caller of `startStaticServe` is `packages/cli/src/webui-server/http-bridge.ts`), and barrel-path imports never match a `./frontend-static-serve.js` stem search.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-server/src/server/*`
  - *How:* `@wrongstack/webui-server`
  - *How:* `packages/cli/src/webui-server/static-serve.ts`
  - *How:* `startStaticServe`
  - *How:* `packages/cli/src/webui-server/http-bridge.ts`
  - *How:* `./frontend-static-serve.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T00:20:04.198Z; skill=codebase-navigation; applied=5; wins=5; skipped=77; skippedWins=77 -->
- **Always close consumers of barrel-only packages like `@wrongstack/mcp` (exports map only `"."`) with three converging greps, not call graphs: `from '@wrongstack/mcp'`, inline `import('@wrongstack/mcp')` type expressions (real consumers in `packages/cli/src/slash-commands/mcp.ts` and `command-context.ts` never appear in from-imports), and a `src/index(\.js)?['"]` stem grep inside the package (zero hits proves no internal barrel imports or cycles).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/mcp`
  - *How:* `"."`
  - *How:* `from '@wrongstack/mcp'`
  - *How:* `import('@wrongstack/mcp')`
  - *How:* `packages/cli/src/slash-commands/mcp.ts`
  - *How:* `command-context.ts`
  - *How:* `src/index(\.js)?['"]`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:19:17.573Z; skill=codebase-navigation; applied=1; wins=1; skipped=142; skippedWins=142 -->
- **Always close TUI bridge-hook consumers with a module-stem grep plus exported-symbol grep, and inspect `packages/tui/src/hooks/use-app-event-bridges.ts` for `Parameters<typeof useHook>[0]` expressions — `AppEventBridgeParams` there is the load-bearing type-only contract seam for `useTuiEventBridge` and sibling bridge hooks, and it never appears in call graphs.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/src/hooks/use-app-event-bridges.ts`
  - *How:* `Parameters<typeof useHook>[0]`
  - *How:* `AppEventBridgeParams`
  - *How:* `useTuiEventBridge`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:16:22.357Z; skill=codebase-navigation; applied=87; wins=87; skipped=58; skippedWins=58 -->
- **Always grep `architecture/core-public-api-usage.json` for the target file path before assessing edit risk in any `packages/tui/src/**` module — the ratchet records each source file's `@wrongstack/core/*` imports repo-wide (not just webui-server), so changing those imports in e.g. `packages/tui/src/hooks/use-statusbar-view-model.ts` requires re-syncing via root `check:architecture` / `check:architecture:sync`. Close TUI hook consumers with a module-stem grep (`use-statusbar-view-model`) plus the exported symbol name; `ReturnType<typeof useHook>` type-only sites (`app-view-contract.ts`, `use-app-picker-keys.ts`) break silently on return-shape changes and never appear in call graphs.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `architecture/core-public-api-usage.json`
  - *How:* `packages/tui/src/**`
  - *How:* `@wrongstack/core/*`
  - *How:* `packages/tui/src/hooks/use-statusbar-view-model.ts`
  - *How:* `check:architecture`
  - *How:* `check:architecture:sync`
  - *How:* `use-statusbar-view-model`
  - *How:* `ReturnType<typeof useHook>`
  - *How:* `app-view-contract.ts`
  - *How:* `use-app-picker-keys.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:09:37.364Z; skill=codebase-navigation; applied=94; wins=94; skipped=59; skippedWins=59 -->
- **Always grep `architecture/core-public-api-usage.json` when probing `packages/webui-server/src/server/*` modules for edit risk — the core public-API usage ratchet records each source file's `@wrongstack/core/*` imports, so changes to those imports require re-syncing the snapshot via root `check:architecture` / `check:architecture:sync`. Close consumers with the exported-symbol grep regardless; barrel imports are absent for phase modules like `start-webui-agent-services.ts` (internal-only, sole caller `start-webui.ts`).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `architecture/core-public-api-usage.json`
  - *How:* `packages/webui-server/src/server/*`
  - *How:* `@wrongstack/core/*`
  - *How:* `check:architecture`
  - *How:* `check:architecture:sync`
  - *How:* `start-webui-agent-services.ts`
  - *How:* `start-webui.ts`
  - *How:* `@wrongstack/core`

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T19:21:20.653Z; skill=codebase-navigation; applied=1; wins=1; skipped=11; skippedWins=11 -->
- **Before reporting a `.temp_files` batch/PowerShell runner as safe to edit, always read the runner's own output log/summary first: an output artifact with a START marker but missing final exit-code lines proves an in-progress or aborted run, and cmd.exe executes `.bat` files line-by-line, so editing a running batch file corrupts the steps it has not reached. Close consumers of such runners with a filename/stem grep plus a read of sibling round docs (REPORT.md/RECOVERY-NOTE.md) — the index never covers `packages`-external, gitignored shell scripts.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files`
  - *How:* `.bat`
  - *How:* `packages`
  - *How:* `REPORT.md/RECOVERY-NOTE.md`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T22:18:02.569Z; skill=codebase-navigation; applied=113; wins=113; skipped=78; skippedWins=78 -->
- **When tracing callers of webui-server API handlers in this repo, expect same-named re-implementations in `packages/cli/src/hq-server/routes/session-handlers.ts` (e.g. `handleApiSessionEvents` with a different signature: `req, res, eventsMatch, transcripts`) serving the HQ router via `packages/cli/src/hq-server/routes.ts`. Always disambiguate by import source and a repo-wide symbol grep with `truncated=false`; do not report `codebase-incoming-calls` results that merge the two symbols.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/cli/src/hq-server/routes/session-handlers.ts`
  - *How:* `handleApiSessionEvents`
  - *How:* `req, res, eventsMatch, transcripts`
  - *How:* `packages/cli/src/hq-server/routes.ts`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T12:29:53.087Z; skill=node-modern; applied=15; wins=15; skipped=33; skippedWins=33 -->
- **Always `tree` a `.temp_files/proof-driven-bug-hunter/<round>/` directory before predicting how its proof runs: presence of `run.mjs` means a scripted runner, absence means manual `pnpm exec vitest run -c vitest.proof.config.mjs`. Treat the config's `root: here` + `.replace(/\\/g, '/')` + absolute-`include` trio as load-bearing on Windows — removing any of the three makes Vitest resolve against `process.cwd()`/backslashes and silently collect 0 tests instead of erroring.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `tree`
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `run.mjs`
  - *How:* `pnpm exec vitest run -c vitest.proof.config.mjs`
  - *How:* `root: here`
  - *How:* `.replace(/\\/g, '/')`
  - *How:* `include`
  - *How:* `process.cwd()`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:43:56.130Z; skill=codebase-navigation; applied=112; wins=112; skipped=64; skippedWins=64 -->
- **Always classify `packages/webui-server/src/server/goal-ws-handler-*.ts` sibling modules before tracing "callers": this family is contract-driven, not call-driven — `goal-ws-handler-internals.ts` is a pure `export interface` module whose only consumers are six `import type` sites (owner `goal-ws-handler.ts` + broadcast/hosts/lifecycle/routing/dispatch helpers), so close the boundary with a module-stem grep plus an exported-symbol grep (`GoalWsHandlerInternals`, `WSClient`) with `truncated=false`, not `codebase-incoming-calls`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/goal-ws-handler-*.ts`
  - *How:* `goal-ws-handler-internals.ts`
  - *How:* `export interface`
  - *How:* `import type`
  - *How:* `goal-ws-handler.ts`
  - *How:* `GoalWsHandlerInternals`
  - *How:* `WSClient`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T16:39:26.501Z; skill=codebase-navigation; applied=3; wins=3; skipped=22; skippedWins=22 -->
- **Always classify every literal-grep hit when confirming "zero imports" of a package in this monorepo: a package name can appear as a declaration (`package.json` `devDependencies`), as KAT-provenance comments in tests (`codebase-index-content-hash.test.ts` documents its expected vectors were verified against `xxhash-wasm@1.1.0` without ever importing it), and at three distinct `pnpm-lock.yaml` sites (`importers` entry, `packages` resolution, `snapshots` entry) — full removal provenance requires all three lockfile sites traced, and comment-only mentions are documentation, not consumers.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `package.json`
  - *How:* `devDependencies`
  - *How:* `codebase-index-content-hash.test.ts`
  - *How:* `xxhash-wasm@1.1.0`
  - *How:* `pnpm-lock.yaml`
  - *How:* `importers`
  - *How:* `packages`
  - *How:* `snapshots`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:45:56.723Z; skill=codebase-navigation; applied=99; wins=99; skipped=75; skippedWins=75 -->
- **Always close the consumer boundary of `goal-ws-handler-hosts.ts`-style adapter modules with a repo-wide module-stem grep plus a grep over every exported symbol name with `truncated=false` — `codebase-incoming-calls` is unnecessary here, and grep display caps at ~3 matches per file, so report match counts and read the file directly when exact call-site line numbers matter.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `goal-ws-handler-hosts.ts`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T23:45:32.614Z; skill=codebase-navigation; applied=68; wins=68; skipped=48; skippedWins=48 -->
- **Always close the consumer boundary of `packages/sage/src/anchors/verify.ts`-style modules with three converging checks, not one: an exhaustive module-path grep (`anchors/verify(\.js)?['"]` with `truncated=false`), an exported-symbol grep including the barrel path (`from '@wrongstack/sage'`), and `codebase-incoming-calls` — because the package barrel `packages/sage/src/index.ts:1` deliberately re-exports only `verifyMemoryAnchors` while the `anchorVerificationCoverage` test seam is reached exclusively via direct `../src/anchors/verify.js` imports and dynamic `await import(...)` in tests, neither of which a barrel-path search alone would surface.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/sage/src/anchors/verify.ts`
  - *How:* `anchors/verify(\.js)?['"]`
  - *How:* `truncated=false`
  - *How:* `from '@wrongstack/sage'`
  - *How:* `codebase-incoming-calls`
  - *How:* `packages/sage/src/index.ts:1`
  - *How:* `verifyMemoryAnchors`
  - *How:* `anchorVerificationCoverage`
  - *How:* `../src/anchors/verify.js`
  - *How:* `await import(...)`
  - *How:* `packages/sage/src/index.ts`
  - *How:* `@wrongstack/sage`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T15:08:11.011Z; skill=node-modern; applied=2; wins=2; skipped=26; skippedWins=26 -->
- **Always re-run the exact repo-wide grep as the final step before reporting a zero-consumer dependency verification in this monorepo — sessions here live-edit the tree (e.g. `pnpm-lock.yaml` and `packages/webui-hq/package.json` both dropped `@radix-ui/react-select` between two grep rounds); a first-round hit followed by a zero is concurrent editing, not tool failure. Anchor: `pnpm-lock.yaml`, `packages/webui-hq/package.json`, `@radix-ui/react-select`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `pnpm-lock.yaml`
  - *How:* `packages/webui-hq/package.json`
  - *How:* `@radix-ui/react-select`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T18:51:07.444Z; applied=2; wins=2; skipped=11; skippedWins=11 -->
- **Always treat a proof-driven-bug-hunter round directory whose tree shows a **single document** — `REPORT.md` as well as `RECOVERY-NOTE.md` — as terminal and epistemic-only: no runnable proof exists to map, blast radius is zero by a repo-wide round-stem grep, and any inline claim about live source (e.g. `packages/techstack/src/sbom.ts` anchors) or git state must be spot-verified by direct read/grep before relaying it, because these gitignored reconstructions have no baseline and claim "verified this session" against a live-edited tree.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `REPORT.md`
  - *How:* `RECOVERY-NOTE.md`
  - *How:* `packages/techstack/src/sbom.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T06:48:49.554Z; skill=codebase-navigation; applied=7; wins=7; skipped=56; skippedWins=56 -->
- **Close consumers of `packages/sdd/src/sdd-task-recovery.ts` with a repo-wide module-stem grep (`sdd-task-recovery`, truncated=false): it is internal-only — `packages/sdd/src/index.ts` does not re-export it, the two real importers alias everything as `delegate*` (`sdd-parallel-run-state.ts:30-36`, `sdd-parallel-run.ts:46`), and tests exercise it only through `SddParallelRun`, so call graphs and test-file imports miss every consumer.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/sdd/src/sdd-task-recovery.ts`
  - *How:* `sdd-task-recovery`
  - *How:* `packages/sdd/src/index.ts`
  - *How:* `delegate*`
  - *How:* `sdd-parallel-run-state.ts:30-36`
  - *How:* `sdd-parallel-run.ts:46`
  - *How:* `SddParallelRun`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:06:53.655Z; skill=codebase-navigation; applied=86; wins=86; skipped=114; skippedWins=114 -->
- **For `packages/telegram`, treat `src/index.ts` as the plugin-entry wiring hub: construction sites (`new PollLock(...)` at src/index.ts:227) live in the barrel's internal setup, not in the modules that consume the type — close "who uses X" with a repo-wide grep on the module path (`./poll-lock.js`, `../../src/poll-lock.js`) plus `new <Symbol>` sites, and check the barrel for absence of re-export before calling a symbol public package API.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/telegram`
  - *How:* `src/index.ts`
  - *How:* `new PollLock(...)`
  - *How:* `./poll-lock.js`
  - *How:* `../../src/poll-lock.js`
  - *How:* `new <Symbol>`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T00:15:38.905Z; skill=codebase-navigation; applied=13; wins=13; skipped=71; skippedWins=71 -->
- **Keep `grep` alternation patterns under 256 characters — the tool rejects longer patterns with VALIDATION_ERROR. When closing consumers of many exported symbols, split into two `files_with_matches` passes with a shorter symbol subset, or prioritize the barrel-re-exported subset (only those can have external consumers when `package.json` exports maps only `"."`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `grep`
  - *How:* `files_with_matches`
  - *How:* `package.json`
  - *How:* `"."`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:39:33.061Z; skill=codebase-navigation; applied=2; wins=2; skipped=177; skippedWins=177 -->
- **Treat `packages/core/src/coordination/sqlite-mailbox.ts` (`SqliteMailbox`, `SQLITE_MAILBOX_FILE`) as internal-only in this repo: the coordination barrel `packages/core/src/coordination/index.ts` re-exports `RemoteMailbox` but not these symbols, the only production class importer is `mailbox-project-server.ts`, and `packages/core/tests/architecture/mailbox-ipc-boundary.test.ts` plus `packages/mailbox-mcp/tests/architecture.test.ts` ratchet that boundary. Before claiming any core symbol is private, confirm the barrel exists (glob) and run a zero-hit grep against it — a missing barrel and a non-re-exporting barrel have different consumer-closure consequences.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/coordination/sqlite-mailbox.ts`
  - *How:* `SqliteMailbox`
  - *How:* `SQLITE_MAILBOX_FILE`
  - *How:* `packages/core/src/coordination/index.ts`
  - *How:* `RemoteMailbox`
  - *How:* `mailbox-project-server.ts`
  - *How:* `packages/core/tests/architecture/mailbox-ipc-boundary.test.ts`
  - *How:* `packages/mailbox-mcp/tests/architecture.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T18:45:51.657Z; skill=codebase-navigation; applied=4; wins=4; skipped=11; skippedWins=11 -->
- **When a `.temp_files/proof-driven-bug-hunter/<round>/` probe returns a directory containing only `RECOVERY-NOTE.md`, treat it as a terminal state: no `run.mjs`/`vitest.proof.config.mjs`/tests exist to map, blast radius is epistemic-only, and the note's inline claims (`.gitignore` anchor line, docs "round" decoy hits, resume command target) must be verified by direct read/grep before relaying them as fact — the note is a gitignored, baseline-less artifact whose content is unrecoverable if overwritten.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files/proof-driven-bug-hunter/<round>/`
  - *How:* `RECOVERY-NOTE.md`
  - *How:* `run.mjs`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `.gitignore`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T06:21:01.884Z; skill=codebase-navigation; applied=5; wins=5; skipped=68; skippedWins=68 -->
- **When a probe quotes a todo item's wording verbatim, search the project's skill markdown (`packages/core/skills/**/SKILL.md`) before mapping implementation files — `codebase-search` indexes skill `.md` bodies, and todo items in this repo are typically skill-step phrasings (e.g. "Record the starting state" from `verify-before-done`, round steps from `evidence-audit`). Matching the owning skill first yields the acceptance contract, not just file locations.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/skills/**/SKILL.md`
  - *How:* `codebase-search`
  - *How:* `.md`
  - *How:* `verify-before-done`
  - *How:* `evidence-audit`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T12:33:20.652Z; applied=21; wins=21; skipped=25; skippedWins=25 -->
- **When mapping a gitignored `.temp_files` proof file after an unread edit, always quote the exact `expect` assertion contracts with `file:line` in the report — there is no git pre-edit baseline to diff against, so the assertion list is the only way the leader can verify their edit preserved the proof's intent. Anchor the round's runner (`vitest.proof.config.mjs` include path or `run.mjs`) in the same report so a rename/move that silently collects 0 tests is detectable.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.temp_files`
  - *How:* `expect`
  - *How:* `file:line`
  - *How:* `vitest.proof.config.mjs`
  - *How:* `run.mjs`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T15:08:11.011Z; skill=codebase-navigation; skipped=28; skippedWins=28 -->
- **When verifying a dependency was fully removed, also grep the human-readable brand name (e.g. `Radix Select`), not just the package specifier (`@radix-ui/react-select`) — doc comments like `packages/webui-hq/src/components/ui/input.tsx:28-31` survive dependency removal and point readers at a component that no longer exists anywhere (`packages/*/src/components/ui/*elect*` glob = 0).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `Radix Select`
  - *How:* `@radix-ui/react-select`
  - *How:* `packages/webui-hq/src/components/ui/input.tsx:28-31`
  - *How:* `packages/*/src/components/ui/*elect*`
  - *How:* `packages/webui-hq/src/components/ui/input.tsx`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-08T15:01:14.756Z; skill=codebase-navigation; applied=14; wins=14; skipped=15; skippedWins=15 -->
- **When confirming package-manager or checking phantom deps in this monorepo, always use the **root** `pnpm-lock.yaml`/`pnpm-workspace.yaml`/`package.json` `packageManager` field — glob hits under `packages/techstack/tests/fixtures/monorepo-pnpm/` are test-fixture decoys. For phantom-dependency checks, grep the whole package dir (not just `src/`) with `truncated=false` and account for every manifest line, then run one repo-wide `files_with_matches` on the candidates: sibling packages (`packages/webui` vs `packages/webui-hq`) declare overlapping `@radix-ui/react-*` copies and `docs/archive/**` references are historical, not runtime consumers — only the sibling's own `src/components/ui/` imports count as usage.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm-lock.yaml`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `package.json`
  - *How:* `packageManager`
  - *How:* `packages/techstack/tests/fixtures/monorepo-pnpm/`
  - *How:* `src/`
  - *How:* `truncated=false`
  - *How:* `files_with_matches`
  - *How:* `packages/webui`
  - *How:* `packages/webui-hq`
  - *How:* `@radix-ui/react-*`
  - *How:* `docs/archive/**`
  - *How:* `src/components/ui/`
  - *How:* `@radix-ui/react-`

---
*Last capture: 2026-10-08T19:21:20.653Z · 26 entries*
