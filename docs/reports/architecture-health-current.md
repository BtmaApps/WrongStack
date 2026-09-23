# Architecture Health Report

**Generated:** 2026-09-23T17:32:53.869Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 36 |
| Production source files | 4123 |
| Production source lines | 973122 |
| Test files | 3646 |
| Workspace dependency edges | 129 |
| Relative module edges | 13448 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 8 |
| Tests without TypeScript test-project coverage | 0 |
| Tests in multiple TypeScript projects | 2 |

## Verification result

PASS — no blocking architecture-health errors.

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 45 | 41 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 26 | 52 | @wrongstack/core |
| @wrongstack/cli | 529 | 532 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 940 | 821 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 44 | 30 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 40 | 29 | @wrongstack/persistence |
| @wrongstack/kanban | 95 | 74 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 45 | 46 | @wrongstack/core |
| @wrongstack/persistence | 7 | 10 | — |
| @wrongstack/plug-lsp | 50 | 48 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 4 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 125 | 120 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 7 | 6 | — |
| @wrongstack/providers | 86 | 77 | @wrongstack/core |
| @wrongstack/requirement-intake | 16 | 10 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 14 | 18 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory |
| @wrongstack/sage | 117 | 112 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 39 | 39 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 18 | 27 | @wrongstack/core |
| @wrongstack/simpleui | 105 | 78 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 51 | 40 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 36 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 230 | 271 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 436 | 384 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 14 | 20 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 583 | 401 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 121 | 46 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 17 | 8 | @wrongstack/core |
| @wrongstack/webui-server | 248 | 233 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
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
| 1252 | `packages/core/src/security/yolo-risk.ts` |
| 1161 | `packages/webui-server/src/server/goal-ws-handler.ts` |
| 999 | `packages/tools/src/_danger-detect.ts` |
| 981 | `packages/sage/src/sqlite-store.ts` |
| 969 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 968 | `packages/core/src/coordination/director.ts` |
| 965 | `packages/webui-server/src/server/embedded-message-router.ts` |
| 958 | `packages/sage/src/project-server.ts` |
| 955 | `packages/tools/src/codebase-index/writer.ts` |
| 954 | `packages/mcp/src/client.ts` |
| 946 | `packages/cli/src/execution.ts` |
| 943 | `packages/tui/src/use-app-controller.tsx` |
| 939 | `packages/acp/src/client/acp-session.ts` |
| 939 | `packages/webui/src/stores/fleet-store.ts` |
| 921 | `packages/tools/src/session-kanban.ts` |
| 921 | `packages/tui/src/app-action-type.ts` |
| 918 | `packages/providers/src/openai-codex.ts` |
| 916 | `packages/webui/src/hooks/ws-handlers.ts` |
| 915 | `packages/cli/src/auth-menu/panel-service.ts` |
| 913 | `packages/webui/src/types/client-message.ts` |
| 911 | `packages/sdd/src/sdd-parallel-run.ts` |
| 909 | `packages/webui/src/components/AudienceMemoryPanel.tsx` |
| 908 | `packages/mcp/src/registry.ts` |
| 908 | `packages/webui/src/components/SddWizard.tsx` |
| 906 | `packages/core/src/types/provider.ts` |
| 902 | `packages/core/src/security/secret-vault.ts` |
| 895 | `packages/webui/src/components/SettingsPanel/BrainSection.tsx` |
| 891 | `packages/webui-server/src/server/memory-handlers.ts` |
| 889 | `packages/cli/src/cli-main.ts` |
| 889 | `packages/core/src/hq/auth-store.ts` |
| 888 | `packages/tools/src/json.ts` |
| 887 | `packages/mcp/src/server.ts` |
| 887 | `packages/sage/src/sqlite-store-hygiene.ts` |
| 886 | `packages/cli/src/slash-commands/sdd.ts` |
| 886 | `packages/core/src/coordination/collab-debug.ts` |
| 883 | `packages/kanban/src/server/project-server.ts` |
| 881 | `packages/webui-server/src/server/backend-services.ts` |
| 881 | `packages/webui/src/components/TechStackView/index.tsx` |
| 880 | `packages/plugins/src/duplicate-code-detector/index.ts` |
| 880 | `packages/providers/src/index.ts` |
| 880 | `packages/tui/src/reducers/settings-values.ts` |
| 879 | `packages/core/src/core/fallback-model.ts` |
| 879 | `packages/tools/src/codebase-index/dead-code-scan.ts` |
| 878 | `packages/cli/src/webui-server.ts` |
| 878 | `packages/plugins/src/test-runner-gate/index.ts` |
| 878 | `packages/primitives/src/regex-guard.ts` |
| 877 | `packages/tools/src/codebase-index/project-server-client.ts` |
| 875 | `packages/cli/src/fleet/host.ts` |
| 874 | `packages/simpleui/src/use-simple-ui-session.tsx` |
| 873 | `packages/sage/src/domain-term-extractor.ts` |

## Exports only tests reference

- 940 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 2 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
