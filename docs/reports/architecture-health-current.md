# Architecture Health Report

**Generated:** 2026-10-05T08:03:11.782Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 37 |
| Production source files | 4573 |
| Production source lines | 1058487 |
| Test files | 4099 |
| Workspace dependency edges | 133 |
| Relative module edges | 14998 |
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
| @wrongstack/acp | 46 | 53 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 29 | 56 | @wrongstack/core |
| @wrongstack/cli | 573 | 590 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/client | 6 | 1 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 1027 | 903 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 44 | 30 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 41 | 33 | @wrongstack/persistence |
| @wrongstack/kanban | 103 | 82 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 53 | 58 | @wrongstack/core |
| @wrongstack/persistence | 8 | 19 | — |
| @wrongstack/plug-lsp | 51 | 52 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 6 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 132 | 126 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 10 | 10 | — |
| @wrongstack/providers | 123 | 109 | @wrongstack/core |
| @wrongstack/requirement-intake | 16 | 11 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 28 | 24 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol |
| @wrongstack/sage | 131 | 125 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 40 | 41 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 19 | 31 | @wrongstack/core |
| @wrongstack/simpleui | 114 | 89 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 51 | 44 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 41 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 281 | 297 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 460 | 413 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 18 | 25 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 669 | 464 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 126 | 50 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 25 | 13 | @wrongstack/core |
| @wrongstack/webui-server | 272 | 267 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
| @wrongstack/wrongtrace | 11 | 8 | — |
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
| 958 | `packages/tools/src/codebase-index/writer.ts` |
| 955 | `packages/mcp/src/registry.ts` |
| 895 | `packages/tui/src/use-app-controller.tsx` |
| 891 | `packages/cli/src/cli-main.ts` |
| 881 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 880 | `packages/core/src/storage/session-store.ts` |
| 874 | `packages/sdd/src/sdd-parallel-run.ts` |
| 873 | `packages/sage/src/sqlite-store.ts` |
| 864 | `packages/cli/src/webui-server.ts` |
| 864 | `packages/tui/src/components/settings-picker.tsx` |
| 863 | `packages/core/src/chronicle/project-server.ts` |
| 862 | `packages/kanban/src/server/project-server.ts` |
| 862 | `packages/webui/src/components/FileExplorer.tsx` |
| 861 | `packages/core/src/coordination/director.ts` |
| 859 | `packages/webui-server/src/server/start-webui.ts` |
| 858 | `packages/core/src/coordination/subagent-budget.ts` |
| 858 | `packages/plugins/src/loop-breaker/index.ts` |
| 858 | `packages/primitives/src/regex-ambiguity.ts` |
| 856 | `packages/core/src/coordination/index.ts` |
| 855 | `packages/cli/src/boot/tui-session-resume.ts` |
| 855 | `packages/core/src/coordination/delegation/run-delegation.ts` |
| 854 | `packages/cli/src/fleet/host.ts` |
| 853 | `packages/acp/src/client/acp-session.ts` |
| 853 | `packages/plugins/src/secret-scanner/index.ts` |
| 852 | `packages/tools/src/pwsh.ts` |
| 852 | `packages/webui-server/src/server/pref-helpers.ts` |
| 851 | `apps/desktop/src/main/runtime-manager.ts` |
| 850 | `packages/webui/src/components/SidePanel/SessionPanel.tsx` |
| 849 | `packages/webui-server/src/server/goal-ws-handler.ts` |
| 848 | `packages/core/src/worktree/worktree-manager.ts` |
| 847 | `packages/core/src/boot.ts` |
| 847 | `packages/governance/src/verification-ledger-store.ts` |
| 847 | `packages/simpleui/src/lib/message-handler.ts` |
| 847 | `packages/webui/src/components/MemoryManager/useMemoryManagerState.ts` |
| 842 | `packages/core/src/goal/phase-orchestrator.ts` |
| 841 | `packages/core/src/core/agent-loop.ts` |
| 841 | `packages/tui/src/app-props.ts` |
| 839 | `packages/cli/src/slash-commands/tool.ts` |
| 839 | `packages/requirement-intake/src/service.ts` |
| 837 | `packages/cli/src/picker.ts` |
| 836 | `packages/core/src/execution/tool-executor.ts` |
| 833 | `packages/governance/src/protocol-decoder.ts` |
| 833 | `packages/webui/src/components/ChatView/CouncilDecisionCard.tsx` |
| 832 | `packages/cli/src/slash-commands/kanban-task-subcommands.ts` |
| 830 | `packages/acp/src/agent/server-agent-turn.ts` |
| 829 | `packages/webui/src/components/MessageBubble/index.tsx` |
| 828 | `packages/cli/src/auth-menu/panel-service.ts` |
| 828 | `packages/core/src/plugins/skills-plugin.ts` |
| 828 | `packages/plugins/src/accessibility-auditor/index.ts` |
| 828 | `packages/sage/src/store-helpers.ts` |

## Exports only tests reference

- 967 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 4 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
