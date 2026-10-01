# Architecture Health Report

**Generated:** 2026-10-01T20:27:05.715Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 37 |
| Production source files | 4317 |
| Production source lines | 1029690 |
| Test files | 3948 |
| Workspace dependency edges | 131 |
| Relative module edges | 14076 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 8 |
| Tests without TypeScript test-project coverage | 0 |
| Tests in multiple TypeScript projects | 4 |

## Verification result

PASS — no blocking architecture-health errors.

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 45 | 51 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 27 | 55 | @wrongstack/core |
| @wrongstack/cli | 553 | 570 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/client | 6 | 1 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 974 | 879 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 44 | 30 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 40 | 31 | @wrongstack/persistence |
| @wrongstack/kanban | 95 | 76 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 47 | 54 | @wrongstack/core |
| @wrongstack/persistence | 8 | 18 | — |
| @wrongstack/plug-lsp | 50 | 51 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 4 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 129 | 126 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 9 | 10 | — |
| @wrongstack/providers | 108 | 100 | @wrongstack/core |
| @wrongstack/requirement-intake | 16 | 11 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 15 | 18 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory |
| @wrongstack/sage | 123 | 124 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 39 | 40 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 19 | 31 | @wrongstack/core |
| @wrongstack/simpleui | 108 | 87 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 51 | 41 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 38 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 245 | 286 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 450 | 404 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 14 | 23 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 619 | 441 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 126 | 49 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 21 | 10 | @wrongstack/core |
| @wrongstack/webui-server | 259 | 255 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
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
| 1827 | `packages/core/src/security/yolo-risk.ts` |
| 1372 | `packages/tools/src/_danger-detect.ts` |
| 1189 | `packages/vector-memory/src/store.ts` |
| 1176 | `packages/webui-server/src/server/goal-ws-handler.ts` |
| 1064 | `packages/tools/src/codebase-index/writer.ts` |
| 1024 | `packages/tools/src/json.ts` |
| 1008 | `packages/cli/src/execution.ts` |
| 1002 | `packages/core/src/coordination/director.ts` |
| 1000 | `packages/mcp/src/client.ts` |
| 997 | `packages/tui/src/use-app-controller.tsx` |
| 992 | `packages/sage/src/sqlite-store.ts` |
| 983 | `packages/webui-server/src/server/embedded-message-router.ts` |
| 982 | `packages/mcp/src/registry.ts` |
| 980 | `packages/sage/src/project-server.ts` |
| 974 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 968 | `packages/providers/src/index.ts` |
| 963 | `packages/core/src/storage/session-store.ts` |
| 960 | `packages/webui/src/types/client-message.ts` |
| 959 | `packages/tools/src/codebase-index/indexer.ts` |
| 946 | `packages/acp/src/client/acp-session.ts` |
| 939 | `packages/tui/src/app-action-type.ts` |
| 939 | `packages/webui/src/stores/fleet-store.ts` |
| 936 | `packages/providers/src/openai-codex.ts` |
| 935 | `packages/simpleui/src/settings-panel.tsx` |
| 933 | `packages/core/src/types/provider.ts` |
| 930 | `packages/sage/src/sqlite-store-search.ts` |
| 926 | `packages/cli/src/auth-menu/panel-service.ts` |
| 924 | `packages/webui/src/hooks/ws-handlers.ts` |
| 921 | `packages/tools/src/session-kanban.ts` |
| 920 | `packages/cli/src/fleet/host.ts` |
| 911 | `packages/kanban/src/server/project-server.ts` |
| 911 | `packages/sdd/src/sdd-parallel-run.ts` |
| 909 | `packages/cli/src/webui-server.ts` |
| 909 | `packages/webui/src/components/AudienceMemoryPanel.tsx` |
| 908 | `packages/webui/src/components/SddWizard.tsx` |
| 907 | `packages/mcp/src/server.ts` |
| 906 | `packages/plugins/src/duplicate-code-detector/index.ts` |
| 906 | `packages/plugins/src/test-runner-gate/index.ts` |
| 904 | `packages/cli/src/cli-main.ts` |
| 903 | `packages/sage/src/sqlite-store-hygiene.ts` |
| 902 | `packages/core/src/security/secret-vault.ts` |
| 901 | `packages/cli/src/slash-commands/sdd.ts` |
| 899 | `packages/core/src/core/fallback-model.ts` |
| 898 | `packages/governance/src/runtime-compatibility.ts` |
| 898 | `packages/webui/src/components/activity-bar/index.tsx` |
| 897 | `packages/webui/src/components/SettingsPanel/BrainSection.tsx` |
| 896 | `packages/webui-server/src/server/backend-services.ts` |
| 896 | `packages/webui-server/src/server/memory-handlers.ts` |
| 894 | `packages/tools/src/bash.ts` |
| 893 | `packages/sage/src/domain-term-extractor.ts` |

## Exports only tests reference

- 974 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 4 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
