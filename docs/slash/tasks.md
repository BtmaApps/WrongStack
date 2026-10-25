# /tasks — Structured Task Management

Manages structured tasks with dependencies, types, priorities, and agent
assignment. More powerful than `/todos` — supports dependency ordering,
status transitions, and subagent assignment.

## Usage

| Usage | Effect |
|---|---|
| `/tasks` | Show task progress + list |
| `/tasks show` | Same as no args |
| `/tasks add <title> [type] [priority]` | Add a task |
| `/tasks start <id\|index>` | Mark task in-progress |
| `/tasks done <id\|index>` | Mark task completed |
| `/tasks fail <id\|index>` | Mark task failed |
| `/tasks status <id> <status>` | Set exact status |
| `/tasks depends <id> <depId...>` | Set dependencies |
| `/tasks assign <id> <agent>` | Assign to agent/subagent |
| `/tasks promote <id>` | Promote task to todo items |
| `/tasks clear` | Remove all tasks |

## Task properties

| Property | Values |
|---|---|
| **Type** | `feature`, `bugfix`, `refactor`, `docs`, `test`, `chore` |
| **Priority** | `critical`, `high`, `medium`, `low` |
| **Status** | `pending`, `in_progress`, `blocked`, `review`, `completed`, `failed` |

## Finding tasks

Tasks can be referenced by:
- **1-based index** — `/tasks done 1`
- **Exact ID** — `/tasks start task_1234567890_abc123`
- **Substring match** — `/tasks done auth` (matches title containing "auth")

## Examples

```bash
/tasks add "Fix auth race condition" bugfix high
/tasks add "Write API docs" docs medium
/tasks start 1
/tasks depends 2 1           # Task 2 depends on task 1
/tasks assign 1 bug-hunter   # Assign to subagent
/tasks status 1 in_progress
/tasks done 1
/tasks promote 2             # Promote to /todos for the AI to see
```

## Completed-work ledger

Completing a task (`/tasks done <id>` or `/tasks status <id> completed`) also
records it in the session's **completed-work ledger**:

- The entry (source `task`, the task title as summary) is appended to
  `ctx.contextEvidence.completedWork`, deduped by `task:<id>`.
- A `[completed_work_ledger]` block is upserted into the system prompt so the
  model sees "work already completed this session — do not redo it".
- When the session has a `completedWork.path` configured in `ctx.meta`, the
  ledger is persisted as a checkpoint
  (`packages/core/src/storage/completed-work-checkpoint.ts`) and survives
  resume.

A ledger failure never undoes the status change — it is surfaced as a ⚠ line
in the command output instead.

## Progress display

```
Tasks — 2/5 completed

  ⏳ #1 Fix auth race condition [bugfix] [high]
  ✅ #2 Write API docs [docs] [medium]
  ⏸ #3 Refactor core [refactor] [medium] — blocked by #1
```

## vs /todos

| | `/tasks` | `/todos` |
|---|---|---|
| **Purpose** | Structured project management | Session-level checklist |
| **Dependencies** | ✅ | ❌ |
| **Types/priorities** | ✅ | ❌ |
| **Agent assignment** | ✅ | ❌ |
| **Promote to todos** | ✅ | — |
| **Storage** | Per-session task file | In-memory context |

Use `/tasks` for project planning, `/todos` for the AI's working checklist.
`/tasks promote <id>` bridges the two — it creates todo items the AI can act on.

## Code reference

- `packages/cli/src/slash-commands/tasks.ts`
- `packages/core/src/storage/task-store.ts` — `TaskFile`; `packages/core/src/utils/task-format.ts` — `TaskItem`
- `packages/core/src/utils/context-evidence.ts` — `recordCompletedWorkEvidence`
- `packages/core/src/storage/completed-work-checkpoint.ts` — ledger checkpoint
