# Architecture Health Report

**Generated:** 2026-09-29T08:06:11.452Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 37 |
| Production source files | 4267 |
| Production source lines | 1009188 |
| Test files | 3859 |
| Workspace dependency edges | 130 |
| Relative module edges | 13910 |
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
| @wrongstack/acp | 45 | 48 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 27 | 55 | @wrongstack/core |
| @wrongstack/cli | 547 | 562 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/client | 6 | 1 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 968 | 865 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 44 | 30 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 40 | 30 | @wrongstack/persistence |
| @wrongstack/kanban | 95 | 75 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 47 | 50 | @wrongstack/core |
| @wrongstack/persistence | 8 | 15 | — |
| @wrongstack/plug-lsp | 50 | 49 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 4 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 129 | 126 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 9 | 9 | — |
| @wrongstack/providers | 93 | 84 | @wrongstack/core |
| @wrongstack/requirement-intake | 16 | 11 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 15 | 18 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory |
| @wrongstack/sage | 122 | 121 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 39 | 40 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 19 | 31 | @wrongstack/core |
| @wrongstack/simpleui | 108 | 85 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 51 | 41 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 38 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 245 | 286 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 448 | 402 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 14 | 21 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 605 | 427 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 126 | 49 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 21 | 10 | @wrongstack/core |
| @wrongstack/webui-server | 255 | 243 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
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
| 1681 | `packages/core/src/security/yolo-risk.ts` |
| 1367 | `packages/tools/src/_danger-detect.ts` |
| 1176 | `packages/webui-server/src/server/goal-ws-handler.ts` |
| 1064 | `packages/tools/src/codebase-index/writer.ts` |
| 1024 | `packages/tools/src/json.ts` |
| 1008 | `packages/cli/src/execution.ts` |
| 997 | `packages/tui/src/use-app-controller.tsx` |
| 981 | `packages/sage/src/sqlite-store.ts` |
| 979 | `packages/sage/src/project-server.ts` |
| 974 | `packages/core/src/coordination/director.ts` |
| 974 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 973 | `packages/mcp/src/client.ts` |
| 972 | `packages/webui-server/src/server/embedded-message-router.ts` |
| 959 | `packages/tools/src/codebase-index/indexer.ts` |
| 958 | `packages/webui/src/types/client-message.ts` |
| 945 | `packages/acp/src/client/acp-session.ts` |
| 939 | `packages/tui/src/app-action-type.ts` |
| 939 | `packages/webui/src/stores/fleet-store.ts` |
| 926 | `packages/cli/src/auth-menu/panel-service.ts` |
| 924 | `packages/core/src/types/provider.ts` |
| 924 | `packages/webui/src/hooks/ws-handlers.ts` |
| 922 | `packages/mcp/src/registry.ts` |
| 921 | `packages/tools/src/session-kanban.ts` |
| 917 | `packages/cli/src/fleet/host.ts` |
| 911 | `packages/kanban/src/server/project-server.ts` |
| 911 | `packages/sdd/src/sdd-parallel-run.ts` |
| 909 | `packages/webui/src/components/AudienceMemoryPanel.tsx` |
| 908 | `packages/providers/src/index.ts` |
| 908 | `packages/webui/src/components/SddWizard.tsx` |
| 904 | `packages/cli/src/cli-main.ts` |
| 904 | `packages/providers/src/openai-codex.ts` |
| 903 | `packages/sage/src/sqlite-store-hygiene.ts` |
| 902 | `packages/core/src/security/secret-vault.ts` |
| 901 | `packages/cli/src/slash-commands/sdd.ts` |
| 899 | `packages/cli/src/webui-server.ts` |
| 899 | `packages/core/src/core/fallback-model.ts` |
| 897 | `packages/webui/src/components/SettingsPanel/BrainSection.tsx` |
| 896 | `packages/webui-server/src/server/backend-services.ts` |
| 896 | `packages/webui-server/src/server/memory-handlers.ts` |
| 894 | `packages/mcp/src/server.ts` |
| 894 | `packages/tools/src/bash.ts` |
| 893 | `packages/tools/src/codebase-index/project-server-client.ts` |
| 889 | `packages/core/src/hq/auth-store.ts` |
| 886 | `packages/core/src/coordination/collab-debug.ts` |
| 886 | `packages/tools/src/codebase-index/dead-code-scan.ts` |
| 885 | `packages/tui/src/reducers/settings-values.ts` |
| 880 | `packages/plugins/src/duplicate-code-detector/index.ts` |
| 878 | `packages/plugins/src/test-runner-gate/index.ts` |
| 878 | `packages/primitives/src/regex-guard.ts` |
| 875 | `packages/kanban/src/verification/verification-context.ts` |

## Exports only tests reference

- 965 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 4 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
