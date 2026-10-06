# Strategic plans

Plans contain higher-level steps; tactical todos contain the current work list.
Both can survive session resume. Project Kanban has a separate durable board
with assignment, verification and completion contracts.

## Storage and ownership

[`plan-store.ts`](../packages/core/src/storage/plan-store.ts) owns `PlanFile`
version 1 and `PlanItem` records: id, title, optional details, timestamps and
`open | in_progress | done` status.

The `plan` tool defaults to session scope using `ctx.meta['plan.path']`.
`scope: "project"` derives `backlog.plan.json` beside the configured session
plan file. A missing path or a path without a directory is refused. CLI seeds
the session path in
[`session.ts`](../packages/cli/src/wiring/session.ts).

`loadPlan` returns null for unreadable, corrupt or structurally invalid input.
`savePlan` performs an atomic `0600` write and returns false on failure.
`mutatePlan` holds the file lock for read/modify/write, rejects duplicate ids
and omission of unfinished items, and throws when persistence fails. Reads
validate version and item-array shape, rather than every externally edited field.

## Tools and surfaces

[`plan.ts`](../packages/tools/src/plan.ts) declares the tool action list:

| Action | Effect |
|---|---|
| `show` | Read the selected plan |
| `add` | Append a titled step |
| `status`, `start`, `done` | Change a step's status |
| `remove`, `clear` | Request removal; unfinished coverage invariants still apply |
| `promote` | Derive tactical todos |
| `template_use` | Append a bundled template |
| `taskify` | Copy a step to the task store |

Targets accept an item id, one-based index or title substring. Successful tool
output has `ok: true`, formatted text and counts; refusal or failed persistence
throws a tool error.

`/plan` is a built-in CLI command in
[`slash-commands/plan.ts`](../packages/cli/src/slash-commands/plan.ts), with
`derive` as a slash alias for todo promotion and `--json` output. It is not
registered by a `wstack-plan` plugin. Browser operations use
[`worklist-handlers.ts`](../packages/webui-server/src/server/handlers/worklist-handlers.ts).

The tool projects session work through
[`session-kanban.ts`](../packages/tools/src/session-kanban.ts). A visible step
or chat completion statement does not replace board acceptance evidence.
See [todos](todos_architecture.md), [the command](slash/plan.md) and
[Kanban architecture](kanban-architecture.md).
