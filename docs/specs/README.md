# Specifications and acceptance contracts

Specifications describe intended requirements and proposed task graphs.
Status is separate from current source existence and from fresh gate evidence.

| Contract | Current reading status |
|---|---|
| [Approval delegation](ai-approval-delegation-sdd.md) | Proposed opt-in reviewer; not current default approval behavior |
| [Web search](first-party-web-search-sdd.md) | Proposed first-party service/tool contract; existing `search` is a separate tool |
| [Sandbox tiers](sandboxed-execution-tiers-sdd.md) | Partial implementation with platform boundaries recorded in the spec |
| [Context editor](context-window-editor-sdd.md) | Original draft and delivered subset; [current guide](../context-editor.md) owns running behavior |
| [Kanban evolution](kanban-agent-evolution-sdd.md) | Historical contract and partial roadmap; proposed file paths are not a source inventory |
| [Required-skill lifetime](required-skill-task-lifetime.md) | Proposal only; no approval or runtime implementation is implied |
| [Requirement intake](requirement-intake-sdd.md) | Delivered domain contract consumed by SDD and host intake flows |
| [Chronicle SQLite journal](chronicle-sqlite-journal.md) | Delivered storage contract; [ownership guide](../chronicle-architecture.md) describes current operation |

Companion `*.task-graph.json` files retain their task-graph schema and original
planned paths. Before executing a graph, refresh its assumptions and match
tasks to current owners. Completed Chimera, mailbox and TechStack gate/spec
records are in [the archive](../archive/specs/).
