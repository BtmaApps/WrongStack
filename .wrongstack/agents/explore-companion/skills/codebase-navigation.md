## Consumer closure

- For `packages/sdd/src/task-visualizer.ts`, verify import specifiers before attributing symbol hits: `renderTaskListWithProgress` in `packages/cli/src/services/sdd/task-manager.ts` only prefix-matches `renderTaskList`, while `packages/tui/src/components/status-bar.tsx` defines another `renderProgress(ratio, width)`. Distinguish `@wrongstack/sdd` imports from local paths, then use a `files_with_matches` pass to confirm `truncated=false`.
- For `packages/webui-server/src/server/**`, search cross-package relative test imports such as `../../webui-server/src/...`; `packages/tui/tests/connection-actions.test.ts` imports `executeServiceAction` directly, which barrels and `codebase-incoming-calls` miss.
- For `packages/core/src/core/fleet-pulse.ts` and siblings such as `mailbox-loop.ts`, combine a module-path grep with exported-symbol searches such as `buildFleetPulseBlock|fleetPulseSignature`. Do not trust `codebase-impact-analysis fleet-pulse`: it returns `symbolFound=false`, and `packages/core/src/index.ts` does not expose the module.
- For `packages/acp/src/registry/agents.catalog.ts`, grep both `agents\.catalog` and `AGENTS_CATALOG|findAgentDescriptor`. Include barrel consumers through `@wrongstack/acp` and `../src/index.js`, especially `packages/cli/src/fleet/acp-wrongstack-bridge.ts` and `packages/acp/tests/acp-helpers.test.ts`. Keep catalog ids such as `claude-code` distinct from registry ids such as `claude-acp`; `REGISTRY_ID_ALIASES` performs the mapping.
- For `packages/core/src/security/error-sanitize.ts`, grep `error-sanitize(\.js)?` plus `sanitizeApiError|scrubErrorDetail|scrubErrorText|ERROR_DETAIL_MAX`. Account for `packages/core/src/security/index.ts`, `@wrongstack/core/security`, `err-message-parity.test.ts`, and `crash-shield.test.ts:337`.
- For `packages/kanban/src/**`, search all exported names, then functions only. Because `packages/kanban/src/index.ts` uses `export *`, classify type-only hits such as `packages/core/src/coordination/kanban-ops-port.ts` and `import type { KanbanBoundaryPolicy }` separately.

## Disambiguation

- For `packages/webui-server/src/server/*-ws-handler.ts`, inspect `backend-services.ts`, `packages/cli/src/webui-server/domain-handlers.ts`, and `terminalHandler:`/`worktreeHandler:` references in `connection-handler.ts`, `route-contracts.ts`, and `embedded-message-router-types.ts`. Check `packages/core/tests/architecture/ram-leak-caps-guard.test.ts` when changing resource caps.
- Disambiguate `packages/webui-server/src/server/memory-handlers.ts` from `packages/webui/src/hooks/ws-memory-handlers.ts` and `server/http-server/vector-memory-handlers.ts`; ignore `tsconfig.tsbuildinfo` noise and classify full import specifiers.
- Disambiguate `breakStaleLock` by module path: `packages/core/src/session-catalog/session-registry-atomic-file.ts` differs from `packages/core/src/plugins/review-claim-store-lock.ts`, re-exported by `review-claim-registry.ts` and imported by `packages/core/tests/plugins/review-claim-registry.test.ts`.

## Non-source probes

- Classify `~/.wrongstack/projects/<hash>/sessions/` as runtime JSONL audit artifacts. Redirect source questions using `grep "transcript\.jsonl"` to `packages/core/src/coordination/agent-monitor.ts`, `packages/cli/src/hq-server/utils.ts`, and `sessions-fleet.ts`. Treat terminal `kind:"status"` with `iteration:999` and a timeout as a dead spawn containing no recoverable findings.
- For `packages/*/tests/**`, use `codebase-skeleton` to identify Vitest suites; treat “dependents” as Vitest include globs and imported production modules, and grep the test stem to verify no importers.
