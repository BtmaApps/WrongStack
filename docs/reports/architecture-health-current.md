# Architecture Health Report

**Generated:** 2026-10-21T10:21:54.644Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 38 |
| Production source files | 5200 |
| Production source lines | 1131481 |
| Test files | 4548 |
| Workspace dependency edges | 139 |
| Relative module edges | 17098 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 5 |
| Tests without TypeScript test-project coverage | 0 |
| Tests in multiple TypeScript projects | 4 |

## Verification result

PASS — no blocking architecture-health errors.

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 52 | 60 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 29 | 56 | @wrongstack/core |
| @wrongstack/cli | 676 | 661 | @wrongstack/acp, @wrongstack/bench, @wrongstack/codebase-index-mcp, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/kanban-mcp, @wrongstack/mailbox-mcp, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/requirement-intake-mcp, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/vibeui, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/client | 7 | 2 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 6 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 1162 | 1002 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 48 | 35 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 45 | 37 | @wrongstack/persistence |
| @wrongstack/kanban | 109 | 84 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 6 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 7 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 63 | 78 | @wrongstack/core |
| @wrongstack/persistence | 9 | 21 | — |
| @wrongstack/plug-lsp | 52 | 57 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 12 | 10 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 152 | 127 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 11 | 14 | — |
| @wrongstack/providers | 136 | 114 | @wrongstack/core |
| @wrongstack/requirement-intake | 18 | 20 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 6 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 28 | 25 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol |
| @wrongstack/sage | 151 | 154 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 45 | 42 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 21 | 34 | @wrongstack/core |
| @wrongstack/simpleui | 128 | 98 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 55 | 64 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 28 | 43 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 340 | 337 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 496 | 428 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 18 | 28 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/vibeui | 53 | 14 | @wrongstack/webui-protocol |
| @wrongstack/webui | 759 | 500 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 127 | 55 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 25 | 13 | @wrongstack/core |
| @wrongstack/webui-server | 301 | 298 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
| @wrongstack/wrongtrace | 11 | 9 | — |
| wrongstack | 1 | 1 | @wrongstack/cli |

## Module cycles

### Runtime

None.

### Type-inclusive

- packages/cli/src/fleet/host.ts ↔ packages/cli/src/fleet/routing.ts
- packages/core/src/coordination/agents/agent-prompts.ts ↔ packages/core/src/coordination/agents/index.ts ↔ packages/core/src/coordination/agents/phase1-discovery.ts ↔ packages/core/src/coordination/agents/phase2-planning.ts ↔ packages/core/src/coordination/agents/phase3-build.ts ↔ packages/core/src/coordination/agents/phase3-wave1-platform.ts ↔ packages/core/src/coordination/agents/phase3-wave2-meta.ts ↔ packages/core/src/coordination/agents/phase4-verify.ts ↔ packages/core/src/coordination/agents/phase5-review.ts ↔ packages/core/src/coordination/agents/phase6-domain.ts ↔ packages/core/src/coordination/agents/phase7-knowledge.ts ↔ packages/core/src/coordination/agents/phase8-delivery.ts ↔ packages/core/src/coordination/agents/phase8-wave3-products.ts ↔ packages/core/src/coordination/agents/phase9-meta.ts ↔ packages/core/src/coordination/agents/phase9-wave4-platform-meta.ts ↔ packages/core/src/coordination/agents/project-agent-auto-optimize.ts ↔ packages/core/src/coordination/agents/project-agent-identity.ts ↔ packages/core/src/coordination/agents/project-agent-optimizer.ts ↔ packages/core/src/coordination/dispatcher.ts ↔ packages/core/src/coordination/fleet.ts ↔ packages/core/src/coordination/multi-agent-coordinator.ts ↔ packages/core/src/execution/parallel-eternal-engine.ts ↔ packages/core/src/types/autonomy.ts ↔ packages/core/src/types/index.ts
- packages/core/src/coordination/brain-telemetry.ts ↔ packages/core/src/coordination/brain.ts ↔ packages/core/src/kernel/events.ts ↔ packages/core/src/kernel/events/brain-events.ts ↔ packages/core/src/kernel/events/session-events.ts
- packages/core/src/core/agent-internals.ts ↔ packages/core/src/core/agent-loop-context.ts ↔ packages/core/src/core/agent-loop-detector.ts ↔ packages/core/src/core/agent-loop.ts ↔ packages/core/src/core/agent-response.ts ↔ packages/core/src/core/agent-tools.ts ↔ packages/core/src/core/agent-types.ts ↔ packages/core/src/core/agent.ts ↔ packages/core/src/extension/extension-points.ts ↔ packages/core/src/extension/registry.ts ↔ packages/core/src/mailbox-attach.ts ↔ packages/core/src/session-note-attach.ts ↔ packages/core/src/types/plugin.ts
- packages/core/src/types/blocks.ts ↔ packages/core/src/types/context.ts ↔ packages/core/src/types/conversation-state.ts ↔ packages/core/src/types/messages.ts ↔ packages/core/src/types/provider.ts ↔ packages/core/src/types/run-env.ts ↔ packages/core/src/types/session-events.ts ↔ packages/core/src/types/session-storage.ts ↔ packages/core/src/types/session.ts ↔ packages/core/src/types/token-counter.ts ↔ packages/core/src/types/tool.ts

## Largest production files

| Lines | File |
|---:|---|
| 1100 | `packages/vibeui/src/components/workspace.tsx` |
| 911 | `packages/vibeui/src/lib/session.ts` |
| 734 | `apps/desktop/src/main/main.ts` |
| 733 | `packages/vibeui/src/components/provider-manager.tsx` |
| 720 | `packages/webui/src/components/MemoryManager/useMemoryManagerState.ts` |
| 715 | `packages/plugins/src/audit/index.ts` |
| 714 | `packages/core/src/coordination/multi-agent-coordinator.ts` |
| 708 | `packages/vibeui/src/lib/use-session.ts` |
| 707 | `packages/acp/src/client/acp-session.ts` |
| 705 | `packages/webui-server/src/server/memory-handlers.ts` |
| 703 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 700 | `packages/core/src/chronicle/project-server.ts` |
| 699 | `packages/cli/src/boot/tui-session-resume.ts` |
| 699 | `packages/governance/src/runtime-compatibility.ts` |
| 698 | `packages/core/src/coordination/subagent-budget.ts` |
| 697 | `packages/core/src/security/secret-vault.ts` |
| 696 | `packages/core/src/coordination/autonomous-brain.ts` |
| 696 | `packages/core/src/coordination/fleet-manager.ts` |
| 696 | `packages/webui-server/src/server/completion-handlers.ts` |
| 696 | `packages/webui/src/components/KanbanView.tsx` |
| 695 | `packages/core/src/registry/tool-registry.ts` |
| 695 | `packages/core/src/storage/config-loader.ts` |
| 695 | `packages/tools/src/browser/tools.ts` |
| 694 | `packages/cli/src/slash-commands/fix-classifier.ts` |
| 693 | `packages/core/src/coordination/agent-monitor.ts` |
| 693 | `packages/simpleui/src/automation-workspace.tsx` |
| 692 | `packages/tools/src/codebase-index/project-server.ts` |
| 692 | `packages/webui/src/components/MailboxPanel.tsx` |
| 691 | `packages/core/src/core/agent-response.ts` |
| 691 | `packages/governance/src/event-store.ts` |
| 691 | `packages/sage/src/types.ts` |
| 691 | `packages/tui/src/hooks/use-director-fleet-bridge.ts` |
| 691 | `packages/webui/src/components/SettingsPanel/index.tsx` |
| 691 | `packages/webui/src/lib/ws-client.ts` |
| 690 | `packages/cli/src/fleet/host-skill-companion.ts` |
| 690 | `packages/cli/src/slash-commands/kanban-task-subcommands.ts` |
| 690 | `packages/core/src/coordination/autonomous-coordinator.ts` |
| 690 | `packages/tui/src/reducers/settings-value-cycle.ts` |
| 689 | `packages/core/src/core/agent-tools.ts` |
| 689 | `packages/core/src/storage/file-session-writer.ts` |
| 688 | `packages/core/src/coordination/task-auctioneer.ts` |
| 688 | `packages/core/src/execution/eternal-autonomy.ts` |
| 687 | `packages/client/src/client.ts` |
| 687 | `packages/core/src/chronicle/project-server-client.ts` |
| 687 | `packages/core/src/hq/commands.ts` |
| 687 | `packages/core/src/storage/session-recovery.ts` |
| 686 | `apps/desktop/src/main/runtime-manager.ts` |
| 686 | `packages/core/src/coordination/provider-status-tracker.ts` |
| 686 | `packages/webui-server/src/server/session-handler-helpers.ts` |
| 685 | `packages/core/src/session-catalog/session-registry.ts` |

## Exports only tests reference

- 966 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 4 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
