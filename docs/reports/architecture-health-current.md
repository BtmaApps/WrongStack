# Architecture Health Report

**Generated:** 2026-10-06T06:53:41.940Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 37 |
| Production source files | 4639 |
| Production source lines | 1063130 |
| Test files | 4114 |
| Workspace dependency edges | 133 |
| Relative module edges | 15264 |
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
| @wrongstack/acp | 48 | 53 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/bench | 29 | 56 | @wrongstack/core |
| @wrongstack/cli | 583 | 593 | @wrongstack/acp, @wrongstack/bench, @wrongstack/core, @wrongstack/desktop, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/simpleui, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/wrongtrace |
| @wrongstack/client | 6 | 1 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 5 | 5 | @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/core | 1047 | 908 | @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop | 45 | 30 | @wrongstack/core, @wrongstack/webui, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/governance | 44 | 33 | @wrongstack/persistence |
| @wrongstack/kanban | 104 | 82 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 5 | 5 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 5 | 8 | @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 54 | 58 | @wrongstack/core |
| @wrongstack/persistence | 8 | 19 | — |
| @wrongstack/plug-lsp | 51 | 52 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 11 | 6 | @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 134 | 126 | @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 11 | 10 | — |
| @wrongstack/providers | 126 | 111 | @wrongstack/core |
| @wrongstack/requirement-intake | 17 | 11 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 5 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 28 | 24 | @wrongstack/core, @wrongstack/governance, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol |
| @wrongstack/sage | 132 | 126 | @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 41 | 41 | @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake |
| @wrongstack/security-scanner | 19 | 31 | @wrongstack/core |
| @wrongstack/simpleui | 115 | 89 | @wrongstack/kanban, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/techstack | 51 | 47 | @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 27 | 41 | @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 284 | 297 | @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 466 | 413 | @wrongstack/core, @wrongstack/kanban, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 18 | 25 | @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/webui | 674 | 464 | @wrongstack/core, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 126 | 50 | @wrongstack/core, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 25 | 13 | @wrongstack/core |
| @wrongstack/webui-server | 276 | 268 | @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/wrongtrace |
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
| 930 | `packages/tools/src/codebase-index/writer.ts` |
| 855 | `packages/core/src/coordination/director.ts` |
| 850 | `packages/cli/src/cli-main.ts` |
| 839 | `packages/webui-server/src/server/start-webui.ts` |
| 828 | `packages/core/src/plugins/skills-plugin.ts` |
| 828 | `packages/plugins/src/accessibility-auditor/index.ts` |
| 828 | `packages/sage/src/store-helpers.ts` |
| 828 | `packages/sdd/src/sdd-parallel-run.ts` |
| 826 | `packages/sage/src/sqlite-store.ts` |
| 825 | `packages/plugins/src/migration-planner/index.ts` |
| 824 | `packages/webui/src/components/RepositoryHistoryView.tsx` |
| 823 | `packages/core/src/execution/brain-runtime.ts` |
| 822 | `packages/tui/src/use-app-controller.tsx` |
| 818 | `packages/core/src/execution/prompt-enhancer.ts` |
| 817 | `packages/tools/src/bash-kill-guard.ts` |
| 813 | `packages/webui/src/stores/session-tab-store.ts` |
| 811 | `packages/plugins/src/cost-tracker/index.ts` |
| 811 | `packages/webui/src/components/CodeMap.tsx` |
| 810 | `packages/cli/src/webui-server.ts` |
| 809 | `packages/simpleui/src/file-explorer.tsx` |
| 808 | `packages/mcp/src/client.ts` |
| 807 | `packages/core/src/chronicle/file-observer.ts` |
| 807 | `packages/security-scanner/src/skill-generator.ts` |
| 806 | `packages/simpleui/src/lib/message-handler.ts` |
| 805 | `packages/sdd/src/spec-builder.ts` |
| 805 | `packages/tools/src/codebase-index/indexer.ts` |
| 803 | `packages/core/src/coordination/collab-debug.ts` |
| 803 | `packages/webui/src/components/SidePanel/SkillsList.tsx` |
| 801 | `packages/cli/src/slash-commands/settings-mutations.ts` |
| 801 | `packages/core/src/storage/session-store.ts` |
| 801 | `packages/sage/src/project-server.ts` |
| 800 | `packages/webui/src/hooks/ws-handlers/chat-handlers.ts` |
| 799 | `packages/sage/src/project-server-client.ts` |
| 799 | `packages/webui-server/src/server/routes.ts` |
| 798 | `packages/cli/src/subcommands/handlers/acp.ts` |
| 798 | `packages/core/src/chronicle/sqlite-journal.ts` |
| 798 | `packages/core/src/core/context.ts` |
| 798 | `packages/core/src/core/system-prompt-builder.ts` |
| 798 | `packages/core/src/execution/council-orchestrator.ts` |
| 797 | `packages/webui/src/lib/ws-client.ts` |
| 796 | `packages/webui/src/components/ChatInput/slash-routing.ts` |
| 795 | `packages/tools/src/codebase-index/ast-invariant-engine.ts` |
| 794 | `packages/core/src/execution/tool-executor.ts` |
| 794 | `packages/core/src/plugins/review-claim-registry.ts` |
| 793 | `packages/core/src/hq/publisher.ts` |
| 793 | `packages/plugins/src/session-recap/index.ts` |
| 792 | `packages/core/src/session-catalog/project-server.ts` |
| 791 | `packages/core/src/coordination/brain-monitor.ts` |
| 791 | `packages/core/src/execution/compaction-elision.ts` |
| 791 | `packages/core/src/storage/file-session-writer.ts` |

## Exports only tests reference

- 962 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 0 test files are not included in a package TypeScript test project.
- 4 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
