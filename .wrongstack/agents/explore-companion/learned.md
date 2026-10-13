# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-13T17:14:25.372Z; skill=codebase-navigation; applied=1; wins=1; skipped=25; skippedWins=25 -->
- **Always answer "skeleton + callers" probes for files under `~/.wrongstack/projects/<hash>/sessions/` by classifying them first: they are runtime JSONL audit artifacts (subagent transcripts), not source modules — no exports/importers exist, so redirect the probe to the path-based producer (`packages/core/src/coordination/agent-monitor.ts`) and readers (`packages/cli/src/hq-server/utils.ts`, `sessions-fleet.ts`) using an exact-text `grep "transcript\.jsonl"`. A terminal `kind:"status"` line with `iteration:999` and a timeout message marks a dead spawn whose transcript holds only tool-call metadata, never recoverable findings.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `~/.wrongstack/projects/<hash>/sessions/`
  - *How:* `packages/core/src/coordination/agent-monitor.ts`
  - *How:* `packages/cli/src/hq-server/utils.ts`
  - *How:* `sessions-fleet.ts`
  - *How:* `grep "transcript\.jsonl"`
  - *How:* `kind:"status"`
  - *How:* `iteration:999`

<!-- learned-stamp: category=warning; capturedAt=2026-10-13T21:15:06.403Z; skill=codebase-navigation; applied=1; wins=1 -->
- **Always close consumers of `packages/kanban/src/**` modules with a two-tier symbol grep — first all exported names (types + functions), then a functions-only pass — because `packages/kanban/src/index.ts` re-exports everything via `export *` and import specifiers are invisible to call graphs. Files matching only the type tier (e.g. `packages/core/src/coordination/kanban-ops-port.ts`, which keeps `import type { KanbanBoundaryPolicy }` to avoid the core→kanban runtime edge) are type-only consumers by design, not missed runtime edges.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check. Project signals: avoid the core→kanban runtime edge) are type-only consumers by design, not missed runtime edges.
  - *How:* `packages/kanban/src/**`
  - *How:* `packages/kanban/src/index.ts`
  - *How:* `export *`
  - *How:* `packages/core/src/coordination/kanban-ops-port.ts`
  - *How:* `import type { KanbanBoundaryPolicy }`

<!-- learned-stamp: category=warning; capturedAt=2026-10-13T20:44:44.769Z; skill=codebase-navigation; skipped=7; skippedWins=7 -->
- **Always disambiguate `breakStaleLock` repo-wide before attributing consumers to `packages/core/src/session-catalog/session-registry-atomic-file.ts`: `packages/core/src/plugins/review-claim-store-lock.ts` (re-exported via `review-claim-registry.ts`) ships a namesake implementation, and `packages/core/tests/plugins/review-claim-registry.test.ts` imports the plugins one — close consumers with a module-path grep plus an import-specifier check, never symbol grep alone.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `breakStaleLock`
  - *How:* `packages/core/src/session-catalog/session-registry-atomic-file.ts`
  - *How:* `packages/core/src/plugins/review-claim-store-lock.ts`
  - *How:* `review-claim-registry.ts`
  - *How:* `packages/core/tests/plugins/review-claim-registry.test.ts`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T09:19:33.467Z; skill=codebase-navigation; applied=4; wins=4; skipped=45; skippedWins=45 -->
- **Always close consumers of `packages/webui-server/src/server/*-ws-handler.ts` classes by searching both wiring sites — embedded `backend-services.ts` (relative import) and CLI host `packages/cli/src/webui-server/domain-handlers.ts` (via `@wrongstack/webui-server` barrel) — plus type-only `terminalHandler:`/`worktreeHandler:` field references in `connection-handler.ts`, `route-contracts.ts`, and `embedded-message-router-types.ts`; a value-import grep alone undercounts dependents, and `packages/core/tests/architecture/ram-leak-caps-guard.test.ts` pins WS-handler resource caps, so constant edits break architecture tests, not package tests.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/*-ws-handler.ts`
  - *How:* `backend-services.ts`
  - *How:* `packages/cli/src/webui-server/domain-handlers.ts`
  - *How:* `@wrongstack/webui-server`
  - *How:* `terminalHandler:`
  - *How:* `worktreeHandler:`
  - *How:* `connection-handler.ts`
  - *How:* `route-contracts.ts`
  - *How:* `embedded-message-router-types.ts`
  - *How:* `packages/core/tests/architecture/ram-leak-caps-guard.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T21:10:40.337Z; skill=codebase-navigation; applied=1; wins=1; skipped=1; skippedWins=1 -->
- **Always resolve module-level probes for `packages/core/src/core/fleet-pulse.ts` (and siblings like `mailbox-loop.ts`) by exporting-symbol searches (`buildFleetPulseBlock`, `fleetPulseSignature`) plus a module-path grep — `codebase-impact-analysis` with the stem `fleet-pulse` returns `symbolFound=false`, and the module is not barrel-exposed through `packages/core/src/index.ts`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/core/fleet-pulse.ts`
  - *How:* `mailbox-loop.ts`
  - *How:* `buildFleetPulseBlock`
  - *How:* `fleetPulseSignature`
  - *How:* `codebase-impact-analysis`
  - *How:* `fleet-pulse`
  - *How:* `symbolFound=false`
  - *How:* `packages/core/src/index.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T17:03:05.914Z; skill=codebase-navigation; applied=4; wins=4; skipped=27; skippedWins=27 -->
- **When closing consumers of `packages/acp/src/registry/agents.catalog.ts` exports, always grep both `agents\.catalog` (module path) and `AGENTS_CATALOG|findAgentDescriptor` (symbols) repo-wide — barrel consumers exist in `packages/cli/src/fleet/acp-wrongstack-bridge.ts` (imports `@wrongstack/acp`) and `packages/acp/tests/acp-helpers.test.ts` (imports `../src/index.js`), which a module-path grep alone misses. Note the id namespace split: catalog ids like `claude-code` vs registry ids like `claude-acp` are distinct and resolved through `REGISTRY_ID_ALIASES` in the bridge. [skill: codebase-navigation]**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/acp/src/registry/agents.catalog.ts`
  - *How:* `agents\.catalog`
  - *How:* `AGENTS_CATALOG|findAgentDescriptor`
  - *How:* `packages/cli/src/fleet/acp-wrongstack-bridge.ts`
  - *How:* `@wrongstack/acp`
  - *How:* `packages/acp/tests/acp-helpers.test.ts`
  - *How:* `../src/index.js`
  - *How:* `claude-code`
  - *How:* `claude-acp`
  - *How:* `REGISTRY_ID_ALIASES`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T08:39:37.891Z; skill=codebase-navigation; applied=25; wins=25; skipped=34; skippedWins=34 -->
- **When closing consumers of `packages/webui-server/src/server/**` internals, always grep for cross-package relative test specifiers like `../../webui-server/src/...` — `packages/tui/tests/connection-actions.test.ts` imports `executeServiceAction` directly from `webui-server` source, a dependency edge invisible to per-package barrels and `codebase-incoming-calls`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/**`
  - *How:* `../../webui-server/src/...`
  - *How:* `packages/tui/tests/connection-actions.test.ts`
  - *How:* `executeServiceAction`
  - *How:* `webui-server`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T08:46:21.584Z; skill=codebase-navigation; applied=1; wins=1; skipped=57; skippedWins=57 -->
- **When closing consumers of `packages/webui-server/src/server/memory-handlers.ts`, always disambiguate the three namesake modules before counting grep hits: `server/memory-handlers.ts` (Sage WS handlers), `packages/webui/src/hooks/ws-memory-handlers.ts` (WebUI client-side), and `server/http-server/vector-memory-handlers.ts` (HTTP) — a plain `memory-handlers` stem search returns all three plus `tsconfig.tsbuildinfo` noise; classify by full import specifier. Also verify barrel exposure**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/memory-handlers.ts`
  - *How:* `server/memory-handlers.ts`
  - *How:* `packages/webui/src/hooks/ws-memory-handlers.ts`
  - *How:* `server/http-server/vector-memory-handlers.ts`
  - *How:* `memory-handlers`
  - *How:* `tsconfig.tsbuildinfo`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T07:41:55.452Z; skill=codebase-navigation; applied=54; wins=54; skipped=17; skippedWins=17 -->
- **When tracing callers of `packages/sdd/src/task-visualizer.ts` exports, always disambiguate namesakes before counting grep hits: `renderTaskListWithProgress` in `packages/cli/src/services/sdd/task-manager.ts` prefix-matches `renderTaskList` but is CLI-local, and `packages/tui/src/components/status-bar.tsx` exports a different `renderProgress(ratio, width)`. Confirm the import specifier (`@wrongstack/sdd` barrel vs local path) before attributing a consumer, and follow a capped content grep with a `files_with_matches` pass to confirm `truncated=false`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/sdd/src/task-visualizer.ts`
  - *How:* `renderTaskListWithProgress`
  - *How:* `packages/cli/src/services/sdd/task-manager.ts`
  - *How:* `renderTaskList`
  - *How:* `packages/tui/src/components/status-bar.tsx`
  - *How:* `renderProgress(ratio, width)`
  - *How:* `@wrongstack/sdd`
  - *How:* `files_with_matches`
  - *How:* `truncated=false`

---
*Last capture: 2026-10-13T21:15:06.403Z · 9 entries*
