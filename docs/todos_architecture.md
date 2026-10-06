# Tactical todos

`ctx.todos` is the session's tactical work list. `TodoItem` in
[`types/context.ts`](../packages/core/src/types/context.ts) carries id, content,
status (`pending | in_progress | completed`) and optional `activeForm`.
Strategic plans, executable Goal phases and project Kanban have separate stores.

## Mutation and completion

Mutate through `ctx.state.replaceTodos(...)`, implemented by
[`ConversationState`](../packages/core/src/core/conversation-state.ts).
Direct array edits bypass observers. The event contract lives in
[`types/conversation-state.ts`](../packages/core/src/types/conversation-state.ts).
An all-completed list can clear the active list while preserving
`completedSnapshot` for observers, so projections can mark cards done.

[`todo.ts`](../packages/tools/src/todo.ts) owns the schema and validation,
applies host Kanban constraints and projects session work through
[`session-kanban.ts`](../packages/tools/src/session-kanban.ts). Todo completion
is a tactical change; board acceptance still requires its verification rules.

## Persistence

[`todos-checkpoint.ts`](../packages/core/src/storage/todos-checkpoint.ts) writes
a version 1 sidecar with session id, timestamp and todo array. Hosts compute
the session-scoped `.todos.json` path. Changes are debounced by 150 ms and
written atomically with `0600` mode. Detaching awaits pending writes.

A missing checkpoint is normal and returns null. Other read/parse failures
emit storage diagnostics and return null. Loaded entries are filtered for
id/content/status strings and optional `activeForm`; this does not validate
every status value. Writes are best effort and report errors without crashing
the agent. A checkpoint is not a transaction over plan/task/Kanban stores.

## Surfaces

CLI/TUI use [`slash-commands/todos.ts`](../packages/cli/src/slash-commands/todos.ts).
The TUI panel is [`todos-monitor.tsx`](../packages/tui/src/components/todos-monitor.tsx).
Browser operations use
[`worklist-handlers.ts`](../packages/webui-server/src/server/handlers/worklist-handlers.ts).
They share the observable session state.

See [the command](slash/todos.md), [plans](plans_architecture.md),
[project goals](architecture/project-goals.md) and
[Kanban workbench](kanban-workbench.md).
