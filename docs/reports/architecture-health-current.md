# Architecture Health Report

**Generated:** 2026-09-21T10:16:38.908Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 36 |
| Production source files | 3969 |
| Production source lines | 954131 |
| Test files | 3575 |
| Workspace dependency edges | 129 |
| Relative module edges | 12870 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 8 |
| Tests without TypeScript test-project coverage | 0 |
| Tests in multiple TypeScript projects | 0 |

## Verification result

PASS — no blocking architecture-health errors.

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 44 | 41 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 26 | 52 | @wrongstack/core |
| @wrongstack/cli | 514 | 520 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 917 | 810 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 44 | 27 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 39 | 29 | @wrongstack/persistence |
| @wrongstack/kanban | 95 | 72 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 39 | 39 | @wrongstack/core |
| @wrongstack/persistence | 7 | 10 | — |
| @wrongstack/plug-lsp | 50 | 46 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 4 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 79 | 113 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 7 | 6 | — |
| @wrongstack/providers | 85 | 76 | @wrongstack/core |
| @wrongstack/requirement-intake | 16 | 10 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 14 | 18 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory |
| @wrongstack/sage | 115 | 111 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 38 | 39 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 18 | 27 | @wrongstack/core |
| @wrongstack/simpleui | 102 | 75 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 50 | 38 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 36 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 224 | 268 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 412 | 374 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 14 | 19 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 564 | 397 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 121 | 46 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 17 | 8 | @wrongstack/core |
| @wrongstack/webui-server | 243 | 231 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
| @wrongstack/wrongtrace | 11 | 6 | — |
| wrongstack | 1 | 1 | @wrongstack/cli |

## Module cycles

### Runtime

None.

### Type-inclusive

- packages/cli/src/fleet/host.ts ↔ packages/cli/src/fleet/routing.ts
- packages/cli/src/subcommands/handlers/audit.ts ↔ packages/cli/src/subcommands/index.ts
- packages/core/src/coordination/agents/agent-prompts.ts ↔ packages/core/src/coordination/agents/index.ts ↔ packages/core/src/coordination/agents/phase1-discovery.ts ↔ packages/core/src/coordination/agents/phase2-planning.ts ↔ packages/core/src/coordination/agents/phase3-build.ts ↔ packages/core/src/coordination/agents/phase3-wave1-platform.ts ↔ packages/core/src/coordination/agents/phase3-wave2-meta.ts ↔ packages/core/src/coordination/agents/phase4-verify.ts ↔ packages/core/src/coordination/agents/phase5-review.ts ↔ packages/core/src/coordination/agents/phase6-domain.ts ↔ packages/core/src/coordination/agents/phase7-knowledge.ts ↔ packages/core/src/coordination/agents/phase8-delivery.ts ↔ packages/core/src/coordination/agents/phase8-wave3-products.ts ↔ packages/core/src/coordination/agents/phase9-meta.ts ↔ packages/core/src/coordination/agents/phase9-wave4-platform-meta.ts ↔ packages/core/src/coordination/agents/project-agent-auto-optimize.ts ↔ packages/core/src/coordination/agents/project-agent-identity.ts ↔ packages/core/src/coordination/agents/project-agent-optimizer.ts ↔ packages/core/src/coordination/dispatcher.ts ↔ packages/core/src/coordination/fleet.ts ↔ packages/core/src/coordination/multi-agent-coordinator.ts ↔ packages/core/src/execution/parallel-eternal-engine.ts ↔ packages/core/src/types/autonomy.ts ↔ packages/core/src/types/index.ts
- packages/core/src/coordination/brain-telemetry.ts ↔ packages/core/src/coordination/brain.ts ↔ packages/core/src/kernel/events.ts ↔ packages/core/src/kernel/events/brain-events.ts ↔ packages/core/src/kernel/events/session-events.ts
- packages/core/src/core/agent-internals.ts ↔ packages/core/src/core/agent-loop-context.ts ↔ packages/core/src/core/agent-loop-detector.ts ↔ packages/core/src/core/agent-loop.ts ↔ packages/core/src/core/agent-response.ts ↔ packages/core/src/core/agent-tools.ts ↔ packages/core/src/core/agent-types.ts ↔ packages/core/src/core/agent.ts ↔ packages/core/src/extension/extension-points.ts ↔ packages/core/src/extension/registry.ts ↔ packages/core/src/mailbox-attach.ts ↔ packages/core/src/session-note-attach.ts ↔ packages/core/src/types/plugin.ts
- packages/core/src/index.ts ↔ packages/core/src/plugins/prompts-plugin.ts ↔ packages/core/src/plugins/skills-plugin.ts ↔ packages/core/src/plugins/sync-plugin.ts ↔ packages/core/src/tools/mcp-control.ts ↔ packages/core/src/tools/mcp-use.ts
- packages/core/src/types/blocks.ts ↔ packages/core/src/types/context.ts ↔ packages/core/src/types/conversation-state.ts ↔ packages/core/src/types/messages.ts ↔ packages/core/src/types/provider.ts ↔ packages/core/src/types/run-env.ts ↔ packages/core/src/types/session-events.ts ↔ packages/core/src/types/session-storage.ts ↔ packages/core/src/types/session.ts ↔ packages/core/src/types/token-counter.ts ↔ packages/core/src/types/tool.ts
- packages/sage/src/middleware/tool-call-memory-retrieval.ts ↔ packages/sage/src/middleware/tool-call-memory-trace.ts ↔ packages/sage/src/middleware/tool-call-memory.ts

## Largest production files

| Lines | File |
|---:|---|
| 1000 | `packages/webui/src/stores/fleet-store.ts` |
| 997 | `packages/sage/src/project-server.ts` |
| 997 | `packages/tools/src/codebase-index/writer.ts` |
| 996 | `packages/mcp/src/client.ts` |
| 994 | `packages/sage/src/sqlite-store.ts` |
| 989 | `packages/acp/src/client/acp-session.ts` |
| 989 | `packages/webui/src/components/SettingsPanel/ProviderSection.tsx` |
| 987 | `packages/core/src/core/system-prompt-builder.ts` |
| 985 | `packages/core/src/coordination/sqlite-mailbox.ts` |
| 983 | `packages/cli/src/webui-server.ts` |
| 981 | `packages/core/src/coordination/director.ts` |
| 980 | `packages/webui/src/components/KanbanTaskInspector.tsx` |
| 978 | `packages/core/src/execution/eternal-autonomy.ts` |
| 978 | `packages/tui/src/use-app-controller.tsx` |
| 977 | `packages/tui/src/reducers/composer.ts` |
| 972 | `packages/providers/src/openai-codex.ts` |
| 971 | `packages/core/src/coordination/fleet-supervisor.ts` |
| 970 | `packages/webui-server/src/server/backend-services.ts` |
| 968 | `packages/cli/src/execution.ts` |
| 968 | `packages/core/src/security/yolo-risk.ts` |
| 965 | `packages/core/src/coordination/collab-debug.ts` |
| 965 | `packages/webui/src/components/SidePanel/SessionList.tsx` |
| 958 | `packages/core/src/coordination/director-tools.ts` |
| 958 | `packages/plugins/src/prompt-firewall/index.ts` |
| 955 | `packages/cli/src/slash-commands/settings-mutations.ts` |
| 955 | `packages/webui/src/stores/local-prefs.ts` |
| 949 | `packages/webui/src/components/CodeMap.tsx` |
| 947 | `packages/webui/src/components/SettingsPanel/MCPSection.tsx` |
| 943 | `packages/core/src/chronicle/project-server.ts` |
| 942 | `packages/tools/src/codebase-index/background-indexer.ts` |
| 939 | `packages/plugins/src/secret-scanner/index.ts` |
| 936 | `packages/simpleui/src/use-simple-ui-session.tsx` |
| 933 | `packages/webui-server/src/server/goal-ws-handler.ts` |
| 932 | `packages/tools/src/kanban-lifecycle-actions.ts` |
| 931 | `packages/cli/src/goal-host.ts` |
| 931 | `packages/governance/src/verification-ledger-store.ts` |
| 931 | `packages/simpleui/src/lib/message-handler.ts` |
| 931 | `packages/webui/src/components/use-office-map-canvas.tsx` |
| 931 | `packages/webui/src/stores/chat-lanes.ts` |
| 930 | `packages/sdd/src/sdd-parallel-run.ts` |
| 928 | `packages/webui/src/stores/session-tab-store.ts` |
| 926 | `packages/mcp/src/authorization.ts` |
| 925 | `packages/cli/src/boot.ts` |
| 925 | `packages/core/src/utils/tool-output-serializer.ts` |
| 925 | `packages/tools/src/codebase-index/project-server-client.ts` |
| 925 | `packages/tui/src/submit-controller.ts` |
| 924 | `packages/core/src/plugin/api.ts` |
| 924 | `packages/tui/src/input-validation.ts` |
| 923 | `packages/tui/src/hooks/use-picker-keys-tools-settings.ts` |
| 921 | `packages/tools/src/session-kanban.ts` |

## Exports only tests reference

- 942 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 0 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
