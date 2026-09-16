<!--ws:if tool=kanban-->
## Kanban scenarios and lifecycle

### When to use which tool

| Need | Tool | When |
|---|---|---|
| **Substantial or multi-step project work** | **`kanban`** | Mandatory durable execution record, from one atomic leaf to a multi-board program |
| Compact active-task view | `todo` | UI projection of real Kanban task ids; never a second task store |
| Strategic explanation | `plan` | Optional roadmap linked to the board; execution remains in Kanban |
| Cross-session reference | `task` | Optional external reference; the executable work remains in Kanban |

### Card lifecycle in detail

1. **Backlog** — The idea is captured with a `title` and `description`. Must specify `assignee`, `successCriteria`, and the other fields in rule #2 before leaving Backlog. `dependsOn` is recommended for ordering but not validated by the lifecycle guard.
2. **Todo** — The card carries what a picker-up needs (description, owner, acceptance criteria) and its dependencies are resolved. Ready for work.
3. **Running** — An agent has claimed the card with the `kanban` tool's `claim_task` action and is actively working. Use its `transition_task` action at material milestones and `heartbeat_assignment` during long operations.
4. **Review** — The worker signals completion. The card stays here until acceptance criteria are verified with the `kanban` tool's `verify_completion` action and evidence is attached. A reviewer agent or the leader checks the output. Worker completion alone does **not** authorize Done.
5. **Done** — All acceptance criteria met, verification report persisted. The card is complete.

### Common scenarios

- **Dependency ordering.** Create the prerequisite card first; create the dependent with `dependsOn: [parentId]` and it waits in Backlog until the prerequisite reaches Done, then moves to Todo and follows the normal lifecycle.
- **Split and parallel work.** `split_atomic` creates children from a parent and sets the parent's `atomic: true` and `childTaskIds`. Children inherit `priority` and `boundary` unconditionally, `labels` and `dependsOn` by default (opt-out), and `assignee`/`assignment`/`successCriteria`/`goalMetrics` only behind the matching `inherit*` flag. Each child runs `Todo → Running → Review → Done` on its own agent; the parent cannot leave Review until every child is verified.
- **Deferred verification.** `verify_completion` runs against `successCriteria` before an atomic parent can finalize — worker completion alone never authorizes Done.
- **Blocked card.** Record the blocker with `add_note` (what is missing, what would clear it) and correct `dependsOn` when the blocker is an unfinished prerequisite. Do not hand-write a blocked status: on a managed board the lifecycle owns `status`, an out-of-band `update_task` status patch is rejected, and the board parks a card that keeps failing its gate. Move to the next ready card and resume this one with `transition_task` when the blocker clears.

**A gate refuses and the thing it wants is wrong.** A refusal names a field, and the field is always reachable — none of these is a reason to stall or to record something untrue.
- Dependency that should never have been recorded → `update_task` with the corrected `dependsOn` (an empty array clears it).
- Acceptance criterion that turned out not to apply → `remove_check`. Never mark a criterion `passed` that did not hold.
- Composite parent whose children were dropped → `update_task` with `atomic: false`.
- The ceremony is not serving this work at all → `release_managed_lifecycle` returns the whole board to plain tracking, keeping cards and history.

### Evidence and hand-off

- Every `kanban` `transition_task` action should carry a `transitionComment` describing what was done; attach links to relevant commits, diffs, or screenshots with the `add_link` action (`url` + `linkTitle`).
- When handing off between agents, use the `kanban` `claim_task` / `release_task` actions with a comment summarizing the hand-off state.
- With the `kanban` `verify_completion` action, attach the verification report: which tests passed, which commands were run, what was validated.
- Write acceptance criteria a machine can settle. When the criterion is a test, a command, a file, a diff or a metric, set `checkType` and put the command or path in `checkNotes`, so `verify_completion` runs it and the result is evidence. A criterion left `manual` records your assertion and tests nothing — reserve it for what genuinely needs a human eye.
<!--ws:end-->
