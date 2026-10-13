# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T09:19:33.467Z; skill=codebase-navigation; applied=4; wins=4; skipped=13; skippedWins=13 -->
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

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T08:39:37.891Z; skill=codebase-navigation; applied=19; wins=19; skipped=8; skippedWins=8 -->
- **When closing consumers of `packages/webui-server/src/server/**` internals, always grep for cross-package relative test specifiers like `../../webui-server/src/...` — `packages/tui/tests/connection-actions.test.ts` imports `executeServiceAction` directly from `webui-server` source, a dependency edge invisible to per-package barrels and `codebase-incoming-calls`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/**`
  - *How:* `../../webui-server/src/...`
  - *How:* `packages/tui/tests/connection-actions.test.ts`
  - *How:* `executeServiceAction`
  - *How:* `webui-server`
  - *How:* `codebase-incoming-calls`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T08:46:21.584Z; skill=codebase-navigation; skipped=26; skippedWins=26 -->
- **When closing consumers of `packages/webui-server/src/server/memory-handlers.ts`, always disambiguate the three namesake modules before counting grep hits: `server/memory-handlers.ts` (Sage WS handlers), `packages/webui/src/hooks/ws-memory-handlers.ts` (WebUI client-side), and `server/http-server/vector-memory-handlers.ts` (HTTP) — a plain `memory-handlers` stem search returns all three plus `tsconfig.tsbuildinfo` noise; classify by full import specifier. Also verify barrel exposure**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui-server/src/server/memory-handlers.ts`
  - *How:* `server/memory-handlers.ts`
  - *How:* `packages/webui/src/hooks/ws-memory-handlers.ts`
  - *How:* `server/http-server/vector-memory-handlers.ts`
  - *How:* `memory-handlers`
  - *How:* `tsconfig.tsbuildinfo`

<!-- learned-stamp: category=convention; capturedAt=2026-10-13T07:41:55.452Z; skill=codebase-navigation; applied=28; wins=28; skipped=11; skippedWins=11 -->
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

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-13T11:07:51.910Z; skill=codebase-navigation; applied=1; wins=1 -->
- **Always scope the import-closure grep to the target package when mapping consumers of `packages/*/src/cli.ts` entry modules — sibling MCP packages (`sage-mcp`, `mailbox-mcp`, `codebase-index-mcp`) each ship their own namesake `src/cli.ts` plus `tests/cli.test.ts` importing `parseArgs`, so a repo-wide `src/cli\.js` pattern cross-matches four packages and display-truncates before reaching the target. Close the loop with a `path: packages/<target>` grep confirming `truncated=false`, and check the package's `bin` field in `package.json` — the bin entry, not any import, is usually the primary consumer of these wrapper modules.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `packages/*/src/cli.ts`
  - *How:* `sage-mcp`
  - *How:* `mailbox-mcp`
  - *How:* `codebase-index-mcp`
  - *How:* `src/cli.ts`
  - *How:* `tests/cli.test.ts`
  - *How:* `parseArgs`
  - *How:* `src/cli\.js`
  - *How:* `path: packages/<target>`
  - *How:* `truncated=false`
  - *How:* `bin`
  - *How:* `package.json`

---
*Last capture: 2026-10-13T11:07:51.910Z · 5 entries*
