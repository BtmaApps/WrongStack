# Architecture Health Report

**Generated:** 2026-10-25T17:02:00.833Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 45 |
| Production source files | 5193 |
| Production source lines | 1133178 |
| Test files | 4576 |
| Workspace dependency edges | 223 |
| Relative module edges | 15471 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 3 |
| Tests without TypeScript test-project coverage | 0 |
| Tests in multiple TypeScript projects | 0 |

## Verification result

PASS — no blocking architecture-health errors.

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 54 | 60 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/primitives |
| @wrongstack/agent-catalog | 44 | 12 | @wrongstack/contracts, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/bench | 29 | 56 | @wrongstack/core |
| @wrongstack/builtin-plugins | 33 | 27 | @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives |
| @wrongstack/chronicle | 52 | 43 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/cli | 675 | 670 | @wrongstack/acp, @wrongstack/agent-catalog, @wrongstack/bench, @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/codebase-index-mcp, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/desktop, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/kanban-mcp, @wrongstack/mailbox-mcp, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/requirement-intake-mcp, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/vibeui, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/worktree, @wrongstack/wrongtrace |
| @wrongstack/client | 7 | 3 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 6 | 5 | @wrongstack/contracts, @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/contracts | 125 | 3 | @wrongstack/kanban, @wrongstack/primitives |
| @wrongstack/coordination | 189 | 177 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/core | 633 | 680 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 48 | 35 | @wrongstack/contracts, @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/goal | 22 | 22 | @wrongstack/contracts, @wrongstack/core, @wrongstack/worktree |
| @wrongstack/governance | 45 | 37 | @wrongstack/persistence |
| @wrongstack/hq | 62 | 42 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban | 109 | 84 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 6 | 5 | @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 7 | 8 | @wrongstack/coordination, @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 74 | 97 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/persistence | 10 | 23 | — |
| @wrongstack/plug-lsp | 52 | 57 | @wrongstack/contracts, @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 12 | 10 | @wrongstack/contracts, @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 152 | 127 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 25 | 18 | — |
| @wrongstack/providers | 138 | 121 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/requirement-intake | 18 | 20 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 6 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 35 | 34 | @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/governance, @wrongstack/hq, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol |
| @wrongstack/sage | 162 | 164 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/hq, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/contracts, @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 45 | 42 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake, @wrongstack/worktree |
| @wrongstack/security-scanner | 21 | 34 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/techstack | 55 | 65 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 28 | 43 | @wrongstack/contracts, @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 373 | 363 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 497 | 430 | @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 18 | 28 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/vibeui | 68 | 23 | @wrongstack/webui-protocol |
| @wrongstack/webui | 769 | 508 | @wrongstack/contracts, @wrongstack/core, @wrongstack/goal, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 127 | 55 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/hq, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 29 | 15 | @wrongstack/contracts, @wrongstack/core, @wrongstack/hq |
| @wrongstack/webui-server | 305 | 309 | @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/worktree, @wrongstack/wrongtrace |
| @wrongstack/worktree | 9 | 2 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/wrongtrace | 11 | 9 | — |
| wrongstack | 1 | 1 | @wrongstack/cli |

## Module cycles

### Runtime

None.

### Type-inclusive

- packages/cli/src/fleet/host.ts ↔ packages/cli/src/fleet/routing.ts
- packages/contracts/src/kernel/events.ts ↔ packages/contracts/src/kernel/events/brain-events.ts ↔ packages/contracts/src/kernel/events/session-events.ts
- packages/contracts/src/types/blocks.ts ↔ packages/contracts/src/types/context.ts ↔ packages/contracts/src/types/conversation-state.ts ↔ packages/contracts/src/types/messages.ts ↔ packages/contracts/src/types/provider.ts ↔ packages/contracts/src/types/run-env.ts ↔ packages/contracts/src/types/session-events.ts ↔ packages/contracts/src/types/session-storage.ts ↔ packages/contracts/src/types/session.ts ↔ packages/contracts/src/types/token-counter.ts ↔ packages/contracts/src/types/tool.ts

## Largest production files

| Lines | File |
|---:|---|
| 1206 | `packages/vibeui/src/components/workspace.tsx` |
| 1098 | `packages/webui/src/components/codemap-model.ts` |
| 889 | `packages/tools/src/codebase-index/infra-parser.ts` |
| 800 | `packages/vibeui/src/components/resource-hub.tsx` |
| 800 | `packages/vibeui/src/lib/session.ts` |
| 757 | `packages/vibeui/src/lib/use-session.ts` |
| 753 | `packages/cli/src/fleet/host-skill-companion.ts` |
| 734 | `apps/desktop/src/main/main.ts` |
| 733 | `packages/vibeui/src/components/provider-manager.tsx` |
| 725 | `packages/coordination/src/multi-agent-coordinator.ts` |
| 720 | `packages/webui/src/components/MemoryManager/useMemoryManagerState.ts` |
| 715 | `packages/coordination/src/agent-monitor.ts` |
| 715 | `packages/plugins/src/audit/index.ts` |
| 709 | `packages/vibeui/src/components/memory-browser.tsx` |
| 707 | `packages/acp/src/client/acp-session.ts` |
| 705 | `packages/chronicle/src/project-server-client.ts` |
| 705 | `packages/webui-server/src/server/memory-handlers.ts` |
| 703 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 700 | `packages/chronicle/src/project-server.ts` |
| 699 | `packages/coordination/src/subagent-budget.ts` |
| 699 | `packages/governance/src/runtime-compatibility.ts` |
| 698 | `packages/coordination/src/provider-status-tracker.ts` |
| 698 | `packages/sage/src/types.ts` |
| 697 | `packages/client/src/client.ts` |
| 697 | `packages/core/src/core/agent-response.ts` |
| 697 | `packages/webui-server/src/server/completion-handlers.ts` |
| 697 | `packages/webui/src/components/KanbanView.tsx` |
| 696 | `packages/cli/src/boot/tui-session-resume.ts` |
| 696 | `packages/coordination/src/autonomous-brain.ts` |
| 696 | `packages/core/src/core/agent-tools.ts` |
| 695 | `packages/coordination/src/fleet-manager.ts` |
| 695 | `packages/core/src/registry/tool-registry.ts` |
| 695 | `packages/core/src/storage/config-loader.ts` |
| 694 | `packages/cli/src/slash-commands/fix-classifier.ts` |
| 693 | `packages/core/src/core/agent-loop.ts` |
| 693 | `packages/core/src/execution/eternal-autonomy.ts` |
| 692 | `packages/coordination/src/sqlite-mailbox.ts` |
| 692 | `packages/tools/src/codebase-index/project-server.ts` |
| 692 | `packages/webui/src/components/MailboxPanel.tsx` |
| 691 | `packages/governance/src/event-store.ts` |
| 691 | `packages/plugins/src/template-engine/index.ts` |
| 691 | `packages/tui/src/hooks/use-director-fleet-bridge.ts` |
| 691 | `packages/webui-server/src/server/session-handler-helpers.ts` |
| 691 | `packages/webui/src/components/SettingsPanel/index.tsx` |
| 690 | `packages/cli/src/slash-commands/kanban-task-subcommands.ts` |
| 690 | `packages/coordination/src/autonomous-coordinator.ts` |
| 690 | `packages/plugins/src/notify-hub/index.ts` |
| 690 | `packages/tui/src/reducers/settings-value-cycle.ts` |
| 689 | `packages/coordination/src/mailbox-project-server-client.ts` |
| 689 | `packages/core/src/storage/file-session-writer.ts` |

## Exports only tests reference

- 955 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 0 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
