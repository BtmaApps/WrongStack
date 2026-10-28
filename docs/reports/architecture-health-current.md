# Architecture Health Report

**Generated:** 2026-10-28T17:24:43.233Z
**Scope:** packages, apps; excluded: website

## Summary

| Measure | Value |
|---|---:|
| Workspace packages | 45 |
| Production source files | 5251 |
| Production source lines | 1156189 |
| Test files | 4605 |
| Workspace dependency edges | 221 |
| Relative module edges | 15741 |
| Non-command slash imports | 0 |
| Runtime module cycles | 0 |
| Type-inclusive module cycles | 5 |
| Tests without TypeScript test-project coverage | 34 |
| Tests in multiple TypeScript projects | 0 |

## Verification result

- 2 unexcepted module cycle(s)

## Workspace packages

| Package | Sources | Tests | Workspace dependencies |
|---|---:|---:|---|
| @wrongstack/acp | 54 | 60 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/primitives |
| @wrongstack/agent-catalog | 44 | 12 | @wrongstack/contracts, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/bench | 29 | 56 | @wrongstack/core |
| @wrongstack/builtin-plugins | 33 | 27 | @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives |
| @wrongstack/chronicle | 52 | 43 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/cli | 674 | 672 | @wrongstack/acp, @wrongstack/agent-catalog, @wrongstack/bench, @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/codebase-index-mcp, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/kanban-mcp, @wrongstack/mailbox-mcp, @wrongstack/mcp, @wrongstack/persistence, @wrongstack/plug-lsp, @wrongstack/plugins, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/requirement-intake-mcp, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sage-mcp, @wrongstack/sdd, @wrongstack/security-scanner, @wrongstack/techstack, @wrongstack/telegram, @wrongstack/tools, @wrongstack/tui, @wrongstack/vector-memory, @wrongstack/vibeui, @wrongstack/webui, @wrongstack/webui-hq, @wrongstack/webui-protocol, @wrongstack/webui-server, @wrongstack/worktree, @wrongstack/wrongtrace |
| @wrongstack/client | 7 | 4 | @wrongstack/webui-protocol |
| @wrongstack/codebase-index-mcp | 6 | 5 | @wrongstack/contracts, @wrongstack/core, @wrongstack/mcp, @wrongstack/tools |
| @wrongstack/contracts | 126 | 4 | @wrongstack/kanban, @wrongstack/primitives |
| @wrongstack/coordination | 190 | 183 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/core | 633 | 678 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/desktop-v2 | 101 | 34 | @wrongstack/contracts, @wrongstack/core, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/goal | 22 | 22 | @wrongstack/contracts, @wrongstack/core, @wrongstack/worktree |
| @wrongstack/governance | 45 | 37 | @wrongstack/persistence |
| @wrongstack/hq | 62 | 42 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban | 108 | 86 | @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/kanban-mcp | 6 | 5 | @wrongstack/contracts, @wrongstack/core, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/mailbox-mcp | 7 | 10 | @wrongstack/coordination, @wrongstack/core, @wrongstack/mcp |
| @wrongstack/mcp | 74 | 97 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/persistence | 10 | 23 | — |
| @wrongstack/plug-lsp | 52 | 57 | @wrongstack/contracts, @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugin-sdk | 12 | 10 | @wrongstack/contracts, @wrongstack/core, @wrongstack/tools |
| @wrongstack/plugins | 152 | 127 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/plugin-sdk, @wrongstack/primitives, @wrongstack/tools |
| @wrongstack/primitives | 25 | 19 | — |
| @wrongstack/providers | 138 | 122 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/requirement-intake | 18 | 20 | @wrongstack/core |
| @wrongstack/requirement-intake-mcp | 6 | 3 | @wrongstack/core, @wrongstack/mcp, @wrongstack/requirement-intake |
| @wrongstack/runtime | 35 | 34 | @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/governance, @wrongstack/hq, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/sage, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol |
| @wrongstack/sage | 162 | 166 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/hq, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/sage-mcp | 7 | 6 | @wrongstack/contracts, @wrongstack/core, @wrongstack/mcp, @wrongstack/sage |
| @wrongstack/sdd | 45 | 42 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/requirement-intake, @wrongstack/worktree |
| @wrongstack/security-scanner | 21 | 34 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/techstack | 55 | 65 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/tools |
| @wrongstack/telegram | 28 | 43 | @wrongstack/contracts, @wrongstack/core, @wrongstack/primitives |
| @wrongstack/tools | 374 | 367 | @wrongstack/agent-catalog, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/kanban, @wrongstack/persistence, @wrongstack/primitives |
| @wrongstack/tui | 497 | 431 | @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/primitives, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/tools |
| @wrongstack/vector-memory | 18 | 28 | @wrongstack/contracts, @wrongstack/core, @wrongstack/persistence, @wrongstack/sage |
| @wrongstack/vibeui | 69 | 24 | @wrongstack/webui-protocol |
| @wrongstack/webui | 768 | 506 | @wrongstack/contracts, @wrongstack/core, @wrongstack/goal, @wrongstack/kanban, @wrongstack/plugins, @wrongstack/providers, @wrongstack/tools, @wrongstack/webui-protocol |
| @wrongstack/webui-hq | 127 | 55 | @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/hq, @wrongstack/tools, @wrongstack/webui-protocol, @wrongstack/webui-server |
| @wrongstack/webui-protocol | 29 | 15 | @wrongstack/contracts, @wrongstack/core, @wrongstack/hq |
| @wrongstack/webui-server | 308 | 318 | @wrongstack/builtin-plugins, @wrongstack/chronicle, @wrongstack/contracts, @wrongstack/coordination, @wrongstack/core, @wrongstack/goal, @wrongstack/hq, @wrongstack/kanban, @wrongstack/mcp, @wrongstack/primitives, @wrongstack/providers, @wrongstack/requirement-intake, @wrongstack/runtime, @wrongstack/sage, @wrongstack/sdd, @wrongstack/techstack, @wrongstack/tools, @wrongstack/vector-memory, @wrongstack/webui-protocol, @wrongstack/worktree, @wrongstack/wrongtrace |
| @wrongstack/worktree | 10 | 3 | @wrongstack/contracts, @wrongstack/core |
| @wrongstack/wrongtrace | 11 | 9 | — |
| wrongstack | 1 | 1 | @wrongstack/cli |

## Module cycles

### Runtime

None.

### Type-inclusive

- apps/desktop-v2/src/EngineDataView.tsx ↔ apps/desktop-v2/src/EngineWorkspace.tsx
- packages/cli/src/fleet/host.ts ↔ packages/cli/src/fleet/routing.ts
- packages/contracts/src/kernel/events.ts ↔ packages/contracts/src/kernel/events/brain-events.ts ↔ packages/contracts/src/kernel/events/session-events.ts
- packages/contracts/src/types/blocks.ts ↔ packages/contracts/src/types/context.ts ↔ packages/contracts/src/types/conversation-state.ts ↔ packages/contracts/src/types/messages.ts ↔ packages/contracts/src/types/provider.ts ↔ packages/contracts/src/types/run-env.ts ↔ packages/contracts/src/types/session-events.ts ↔ packages/contracts/src/types/session-storage.ts ↔ packages/contracts/src/types/session.ts ↔ packages/contracts/src/types/token-counter.ts ↔ packages/contracts/src/types/tool.ts
- packages/tools/src/codebase-index/codebase-ast-replace-tool.ts ↔ packages/tools/src/codebase-index/codebase-atlas-tool.ts ↔ packages/tools/src/codebase-index/codebase-context-tool.ts ↔ packages/tools/src/codebase-index/codebase-diff-impact-tool.ts ↔ packages/tools/src/codebase-index/codebase-flow-trace-tool.ts ↔ packages/tools/src/codebase-index/codebase-impact-analysis-tool.ts ↔ packages/tools/src/codebase-index/codebase-incoming-calls-tool.ts ↔ packages/tools/src/codebase-index/codebase-index-tool.ts ↔ packages/tools/src/codebase-index/codebase-invariant-check-tool.ts ↔ packages/tools/src/codebase-index/codebase-onboard-tool.ts ↔ packages/tools/src/codebase-index/codebase-outgoing-calls-tool.ts ↔ packages/tools/src/codebase-index/codebase-read-symbol-tool.ts ↔ packages/tools/src/codebase-index/codebase-repo-map-tool.ts ↔ packages/tools/src/codebase-index/codebase-search-tool.ts ↔ packages/tools/src/codebase-index/codebase-skeleton-tool.ts ↔ packages/tools/src/codebase-index/codebase-stats-tool.ts ↔ packages/tools/src/codebase-index/codebase-targeted-test-tool.ts ↔ packages/tools/src/codebase-index/next-step-notes.ts

## Largest production files

| Lines | File |
|---:|---|
| 1370 | `apps/desktop-v2/src/FileWorkspace.tsx` |
| 1206 | `packages/vibeui/src/components/workspace.tsx` |
| 1098 | `packages/webui/src/components/codemap-model.ts` |
| 915 | `apps/desktop-v2/src/CodeAtlas.tsx` |
| 913 | `apps/desktop-v2/src/ProjectKnowledge.tsx` |
| 889 | `packages/tools/src/codebase-index/infra-parser.ts` |
| 848 | `apps/desktop-v2/src/SkillLibrary.tsx` |
| 815 | `packages/vibeui/src/lib/session.ts` |
| 806 | `apps/desktop-v2/src/ProjectMemory.tsx` |
| 804 | `apps/desktop-v2/src/SessionComposer.tsx` |
| 800 | `packages/vibeui/src/components/resource-hub.tsx` |
| 754 | `packages/client/src/client.ts` |
| 753 | `packages/cli/src/fleet/host-skill-companion.ts` |
| 750 | `packages/vibeui/src/lib/use-session.ts` |
| 747 | `packages/webui-server/src/server/memory-handlers.ts` |
| 743 | `apps/desktop-v2/src/KanbanTaskInspector.tsx` |
| 737 | `packages/coordination/src/sqlite-mailbox.ts` |
| 733 | `packages/vibeui/src/components/provider-manager.tsx` |
| 725 | `packages/coordination/src/multi-agent-coordinator.ts` |
| 723 | `packages/webui-server/src/server/completion-handlers.ts` |
| 720 | `packages/webui/src/components/MemoryManager/useMemoryManagerState.ts` |
| 715 | `packages/coordination/src/agent-monitor.ts` |
| 715 | `packages/plugins/src/audit/index.ts` |
| 709 | `packages/vibeui/src/components/memory-browser.tsx` |
| 707 | `packages/acp/src/client/acp-session.ts` |
| 706 | `packages/chronicle/src/project-server.ts` |
| 705 | `packages/chronicle/src/project-server-client.ts` |
| 703 | `packages/core/src/execution/auto-compaction-middleware.ts` |
| 703 | `packages/mailbox-mcp/src/adapter.ts` |
| 703 | `packages/tools/src/codebase-index/ast-symbol-mutator.ts` |
| 701 | `packages/coordination/src/provider-status-tracker.ts` |
| 699 | `packages/coordination/src/subagent-budget.ts` |
| 699 | `packages/governance/src/runtime-compatibility.ts` |
| 699 | `packages/sage/src/types.ts` |
| 697 | `packages/core/src/core/agent-response.ts` |
| 697 | `packages/tools/src/codebase-index/writer-graph-reader.ts` |
| 697 | `packages/webui/src/components/KanbanView.tsx` |
| 696 | `packages/cli/src/boot/tui-session-resume.ts` |
| 696 | `packages/coordination/src/autonomous-brain.ts` |
| 696 | `packages/core/src/core/agent-tools.ts` |
| 695 | `packages/coordination/src/fleet-manager.ts` |
| 695 | `packages/core/src/registry/tool-registry.ts` |
| 695 | `packages/core/src/storage/config-loader.ts` |
| 694 | `packages/cli/src/slash-commands/fix-classifier.ts` |
| 694 | `packages/requirement-intake/src/service.ts` |
| 693 | `packages/core/src/core/agent-loop.ts` |
| 693 | `packages/core/src/execution/eternal-autonomy.ts` |
| 693 | `packages/hq/src/publisher.ts` |
| 693 | `packages/tui/src/hooks/use-provider-event-bridge.ts` |
| 693 | `packages/vector-memory/src/store.ts` |

## Exports only tests reference

- 944 runtime exports are referenced by tests and by no other production file.
- Green coverage on one of these proves the function works, not that anything calls it.
- The set is frozen in `architecture/test-only-exports.json`; the check fires on additions.

## TypeScript test coverage debt

- 34 test files are not included in a package TypeScript test project.
- 0 test files are included in more than one package TypeScript project.

> This report is generated. Change architecture registry inputs or source code, then regenerate it; do not hand-edit measurements.
