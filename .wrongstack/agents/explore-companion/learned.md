# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:49:16.696Z; skill=codebase-navigation; applied=19; wins=19; skipped=36; skippedWins=36 -->
- **Always check for env-var-driven test seams when closing consumers of `packages/sage/src/project-server-*.ts` helper modules: `packages/sage/tests/project-server-slow-op.test.ts` exercises `createSlowOperationReporter` only by spawning the daemon with `WRONGSTACK_SAGE_SLOW_OP_MS: '0'` and asserting stderr, never by importing `project-server-slow-ops.js` — a module-stem grep alone reports zero test importers while behavior is still ratcheted. Close such modules with a module-stem grep plus exported-symbol grep plus a full barrel read (`packages/sage/src/index.ts` re-exports nothing from this module, making it internal-only).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sage/src/project-server-*.ts`
  - *How:* `packages/sage/tests/project-server-slow-op.test.ts`
  - *How:* `createSlowOperationReporter`
  - *How:* `WRONGSTACK_SAGE_SLOW_OP_MS: '0'`
  - *How:* `project-server-slow-ops.js`
  - *How:* `packages/sage/src/index.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T07:22:07.712Z; skill=codebase-navigation; applied=1; wins=1 -->
- **Always classify repo-wide symbol-grep hits for `packages/sdd` class names as potential **domain-glossary terms before reporting them as consumers**: names like `SddBoardProjector` are registered in `packages/sage/src/domain-term-candidates.ts` / `domain-term-extractor.ts` and ratcheted by `packages/core/tests/core/system-prompt-glossary.test.ts` and `packages/cli/tests/wiring/domain-glossary.test.ts` — these files match a symbol-name grep but never import the module, and a class rename would break those glossary tests. Close real consumers with a module-stem grep (import specifiers) plus the package barrel (`packages/sdd/src/index.ts`), then treat remaining symbol-only hits as glossary/docs.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/sdd`
  - *How:* `SddBoardProjector`
  - *How:* `packages/sage/src/domain-term-candidates.ts`
  - *How:* `domain-term-extractor.ts`
  - *How:* `packages/core/tests/core/system-prompt-glossary.test.ts`
  - *How:* `packages/cli/tests/wiring/domain-glossary.test.ts`
  - *How:* `packages/sdd/src/index.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T22:09:54.833Z; skill=codebase-navigation; applied=17; wins=17; skipped=125; skippedWins=125 -->
- **Always close callers of `packages/webui-server/src/server/*` modules with a symbol-name grep, not just the module stem: CLI hosts reach them through the `@wrongstack/webui-server` package barrel and the `packages/cli/src/webui-server/static-serve.ts` facade (e.g. the only production caller of `startStaticServe` is `packages/cli/src/webui-server/http-bridge.ts`), and barrel-path imports never match a `./frontend-static-serve.js` stem search.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/webui-server/src/server/*`
  - *How:* `@wrongstack/webui-server`
  - *How:* `packages/cli/src/webui-server/static-serve.ts`
  - *How:* `startStaticServe`
  - *How:* `packages/cli/src/webui-server/http-bridge.ts`
  - *How:* `./frontend-static-serve.js`

<!-- learned-stamp: category=warning; capturedAt=2026-10-08T00:20:04.198Z; skill=codebase-navigation; applied=3; wins=3; skipped=24; skippedWins=24 -->
- **Always close consumers of barrel-only packages like `@wrongstack/mcp` (exports map only `"."`) with three converging greps, not call graphs: `from '@wrongstack/mcp'`, inline `import('@wrongstack/mcp')` type expressions (real consumers in `packages/cli/src/slash-commands/mcp.ts` and `command-context.ts` never appear in from-imports), and a `src/index(\.js)?['"]` stem grep inside the package (zero hits proves no internal barrel imports or cycles).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `@wrongstack/mcp`
  - *How:* `"."`
  - *How:* `from '@wrongstack/mcp'`
  - *How:* `import('@wrongstack/mcp')`
  - *How:* `packages/cli/src/slash-commands/mcp.ts`
  - *How:* `command-context.ts`
  - *How:* `src/index(\.js)?['"]`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:19:17.573Z; skill=codebase-navigation; applied=1; wins=1; skipped=87; skippedWins=87 -->
- **Always close TUI bridge-hook consumers with a module-stem grep plus exported-symbol grep, and inspect `packages/tui/src/hooks/use-app-event-bridges.ts` for `Parameters<typeof useHook>[0]` expressions — `AppEventBridgeParams` there is the load-bearing type-only contract seam for `useTuiEventBridge` and sibling bridge hooks, and it never appears in call graphs.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/tui/src/hooks/use-app-event-bridges.ts`
  - *How:* `Parameters<typeof useHook>[0]`
  - *How:* `AppEventBridgeParams`
  - *How:* `useTuiEventBridge`

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:16:22.357Z; skill=codebase-navigation; applied=57; wins=57; skipped=33; skippedWins=33 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T23:09:37.364Z; skill=codebase-navigation; applied=63; wins=63; skipped=35; skippedWins=35 -->
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

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T22:18:02.569Z; skill=codebase-navigation; applied=89; wins=89; skipped=47; skippedWins=47 -->
- **When tracing callers of webui-server API handlers in this repo, expect same-named re-implementations in `packages/cli/src/hq-server/routes/session-handlers.ts` (e.g. `handleApiSessionEvents` with a different signature: `req, res, eventsMatch, transcripts`) serving the HQ router via `packages/cli/src/hq-server/routes.ts`. Always disambiguate by import source and a repo-wide symbol grep with `truncated=false`; do not report `codebase-incoming-calls` results that merge the two symbols.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/cli/src/hq-server/routes/session-handlers.ts`
  - *How:* `handleApiSessionEvents`
  - *How:* `req, res, eventsMatch, transcripts`
  - *How:* `packages/cli/src/hq-server/routes.ts`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:43:56.130Z; skill=codebase-navigation; applied=86; wins=86; skipped=35; skippedWins=35 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:45:56.723Z; skill=codebase-navigation; applied=75; wins=75; skipped=44; skippedWins=44 -->
- **Always close the consumer boundary of `goal-ws-handler-hosts.ts`-style adapter modules with a repo-wide module-stem grep plus a grep over every exported symbol name with `truncated=false` — `codebase-incoming-calls` is unnecessary here, and grep display caps at ~3 matches per file, so report match counts and read the file directly when exact call-site line numbers matter.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `goal-ws-handler-hosts.ts`
  - *How:* `truncated=false`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T23:45:32.614Z; skill=codebase-navigation; applied=42; wins=42; skipped=19; skippedWins=19 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T06:48:49.554Z; skill=codebase-navigation; applied=7; wins=7; skipped=1; skippedWins=1 -->
- **Close consumers of `packages/sdd/src/sdd-task-recovery.ts` with a repo-wide module-stem grep (`sdd-task-recovery`, truncated=false): it is internal-only — `packages/sdd/src/index.ts` does not re-export it, the two real importers alias everything as `delegate*` (`sdd-parallel-run-state.ts:30-36`, `sdd-parallel-run.ts:46`), and tests exercise it only through `SddParallelRun`, so call graphs and test-file imports miss every consumer.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/sdd/src/sdd-task-recovery.ts`
  - *How:* `sdd-task-recovery`
  - *How:* `packages/sdd/src/index.ts`
  - *How:* `delegate*`
  - *How:* `sdd-parallel-run-state.ts:30-36`
  - *How:* `sdd-parallel-run.ts:46`
  - *How:* `SddParallelRun`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:06:53.655Z; skill=codebase-navigation; applied=72; wins=72; skipped=73; skippedWins=73 -->
- **For `packages/telegram`, treat `src/index.ts` as the plugin-entry wiring hub: construction sites (`new PollLock(...)` at src/index.ts:227) live in the barrel's internal setup, not in the modules that consume the type — close "who uses X" with a repo-wide grep on the module path (`./poll-lock.js`, `../../src/poll-lock.js`) plus `new <Symbol>` sites, and check the barrel for absence of re-export before calling a symbol public package API.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/telegram`
  - *How:* `src/index.ts`
  - *How:* `new PollLock(...)`
  - *How:* `./poll-lock.js`
  - *How:* `../../src/poll-lock.js`
  - *How:* `new <Symbol>`

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T00:15:38.905Z; skill=codebase-navigation; applied=6; wins=6; skipped=23; skippedWins=23 -->
- **Keep `grep` alternation patterns under 256 characters — the tool rejects longer patterns with VALIDATION_ERROR. When closing consumers of many exported symbols, split into two `files_with_matches` passes with a shorter symbol subset, or prioritize the barrel-re-exported subset (only those can have external consumers when `package.json` exports maps only `"."`).**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `grep`
  - *How:* `files_with_matches`
  - *How:* `package.json`
  - *How:* `"."`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T22:39:33.061Z; skill=codebase-navigation; applied=2; wins=2; skipped=122; skippedWins=122 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-08T06:21:01.884Z; skill=codebase-navigation; skipped=18; skippedWins=18 -->
- **When a probe quotes a todo item's wording verbatim, search the project's skill markdown (`packages/core/skills/**/SKILL.md`) before mapping implementation files — `codebase-search` indexes skill `.md` bodies, and todo items in this repo are typically skill-step phrasings (e.g. "Record the starting state" from `verify-before-done`, round steps from `evidence-audit`). Matching the owning skill first yields the acceptance contract, not just file locations.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/skills/**/SKILL.md`
  - *How:* `codebase-search`
  - *How:* `.md`
  - *How:* `verify-before-done`
  - *How:* `evidence-audit`

---
*Last capture: 2026-10-08T07:22:07.712Z · 16 entries*
