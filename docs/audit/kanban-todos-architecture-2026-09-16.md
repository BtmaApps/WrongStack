# Kanban and todos — end-to-end architecture analysis (2026-09-16)

> Full-system read of the Kanban subsystem and the session todo list: data model,
> ownership, IPC, lifecycle, verification, dispatch, every surface (tool, MCP,
> CLI, TUI, WebUI, HQ), and the prompt contract that drives all of it.
>
> Companion to [`kanban-todos-review-2026-09-15.md`](./kanban-todos-review-2026-09-15.md),
> which recorded repairs. This document records **structure and current state**,
> and ends with six findings that survived verification.

## Method and evidence

Read: `packages/kanban` (19.5k LOC src), `packages/kanban-mcp`, the Kanban/todo
surface in `packages/tools` (~3.3k LOC), `packages/webui-server` (18 kanban
modules, ~3.4k LOC), `packages/webui` (28 Kanban components + store),
`packages/cli` (slash commands, HQ sync, dispatch), `packages/tui` (panel, audit,
slash), `packages/core` (boundary, ports, HQ store, todo state/format/checkpoint,
agent loop injection), `packages/sdd`, plus the instruction sources.

Suites run for this analysis, both green:

| Group | Files | Tests | Exit |
| --- | --- | --- | --- |
| `kanban` + `kanban-mcp` + tools todo suites | 76 | 1193 | 0 |
| Cross-surface: webui-server routes/subscriber/contract/decomposition, CLI slash + cleaner parity + governance hosts + HQ sync, core boundary ×2, tools dead-ends + executable-criteria | 12 | 142 | 0 |

No source was modified. Counts overlap between groups only where a file appears
in both lists; they are not additive beyond that.

---

## 1. The shape of the system

There are **two work surfaces and one authority**. The board is the authority.
The todo list is a projection of it.

```text
                     ┌──────────────────────────────────────┐
  agent `todo` tool  │  .wrongstack/kanbans/_kanban.sqlite   │
  agent `kanban` tool│  (single writer: the elected daemon)  │
  /kanban, /todos    └───────────────▲──────────────────────┘
  TUI panel  F12                     │ named pipe (win) / unix socket
  WebUI kanban.*  ws                 │ protocol v6 — domainCall allowlist
  kanban-mcp (external agents)       │
  Director kanban_queue      ┌───────┴────────────────────────┐
  SDD / Goal run mirror      │ server/project-server.ts       │
  HQ cross-project sync      │ auth token, lease sweep, idle  │
                             └────────────────────────────────┘
```

Every stateful call from every client goes through
`client-domain.ts` → `domainCall` → the daemon's local `manager.ts`. There is no
direct-file fallback in production: `runtimeStorage()` returns the remote
storage, and a disabled daemon fails closed
(`server/client.ts`, `storage.ts:runtimeStorage`).

### Ownership, in one table

| Concern | Single source | Enforced by |
| --- | --- | --- |
| Board/task state | SQLite, daemon-owned | `bindProjectEndpoint` election; only the winner opens the DB |
| Which operations may cross the wire | `domain-operations.ts` (76 ops) | server rejects anything else as `INVALID_INPUT` |
| "Done" means | `verification/completion-gate.ts` | every completion path funnels through it |
| Readiness/claimability | `isTaskReadyForWork` + `classifyTaskForQueue` | agreement corpus tests |
| "Is this board worth looking at" | `queue-anomalies.ts` | three surfaces branch on `hasKanbanQueueAnomalies` |
| Board hygiene verdicts | TUI `kanban-audit.ts` ≡ WebUI `kanban-cleaner.ts` | `kanban-cleaner-parity.test.ts` compares `taskId:code:severity` |
| Governance flag | `tools.kanbanGovernance` (default `false`) | `kanban-governance-hosts.test.ts` walks all 6 `new ToolExecutor(` sites |

---

## 2. Storage, IPC, and consistency

**Database.** `<projectRoot>/.wrongstack/kanbans/_kanban.sqlite`, WAL, five
tables: `kanban_meta`, `kanban_boards`, `kanban_events`,
`kanban_workflow_commands`, `kanban_workflow_state`, `kanban_board_history`.
Board history is a global append-only log that deliberately **survives board
deletion**; per-board events do not.

**Protocol v6** (`server/protocol.ts`) carries a typed wire codec that wraps
every value (`['string', …]`, `['map', …]`) rather than reserving a magic key —
so task metadata can never collide with the envelope. Cycles and unsupported
types throw at encode time.

**Auth.** WS-027: every request carries an `authToken` read from the daemon's
`0600` `.wrongstack/kanban-server.json`, never from the `hello` frame — the
explicit lesson from WS-028, where SAGE handed its credential to the caller it
meant to refuse. Compared with `timingSafeTokenEqual`. On Windows the file's ACLs
are additionally stripped with `restrictFilePermissions`, because `mode: 0o600`
is ignored there and named pipes exclude nobody.

**Concurrency.** `mutateBoard` fingerprints the board (SHA-256 of canonical JSON)
before and after the mutator, re-reads the on-disk revision under the same lock,
and throws `StaleWriteError` when it moved. A genuine no-op skips the revision
bump and the write entirely — which matters because the supervisor's mutator
returns `null` on most passes and every write wakes every subscriber.

**Lifecycle hardening worth noting.** The daemon arms its idle timer at
`listen()` (not only on socket close, which used to leave never-connected
daemons alive forever), keeps one SIGTERM/SIGINT pair per *process* behind a
`Symbol.for` guard, force-exits through `stopAndExit` with a 2s hang guard, caps
per-client write buffers at 8 MiB and drops clients that fall behind, and runs a
root-liveness check so a deleted project root kills the daemon.

---

## 3. Todos: what they actually are

`TodoItem` (`core/src/types/context.ts:40`) is deliberately small: `id`,
`content`, `status`, `activeForm`, plus four projection fields —
`promotedFromPlan`, `promotedFromTask`, `kanbanBoardId`, `kanbanTaskId`, and the
board-derived `blockedBy`.

### The auto-clear rule everything else works around

`ConversationState.replaceTodos` (`core/src/core/conversation-state.ts:270`):
when every row is `completed` and the list is non-empty, the effective list
becomes `[]` and the change event carries `completedSnapshot` with the real
rows. This one rule is the origin of several guards elsewhere:

- `session-kanban-sync.ts` compares the incoming projection against **both**
  `projectedTodos` and the collapsed `effectiveTodos`; without that second
  comparison a finished managed board re-fired `[KANBAN TODO UPDATE]` and a
  mailbox broadcast on every board event forever — a self-sustaining loop that
  tells the agent the board changed and never stops.
- `todo.ts` mirrors the *requested* list rather than `ctx.todos`, so the final
  all-done snapshot still reaches Done.
- CLI `/todos done` and WebUI `todo.update` both special-case
  "completed and the list auto-cleared" so they do not report a refusal.

### Where todos are stored and replayed

| Path | Purpose |
| --- | --- |
| `core/src/storage/todos-checkpoint.ts` | `<session>.todos.json`, atomic `0600`, 150 ms debounce, single-flight drain, flush-on-detach. Read once on resume. |
| `webui-server/src/server/start-webui-todos.ts` | Rebinds the checkpoint when the active session switches, serialized through a transition tail so a failed detach still binds the next session |
| `core/src/utils/todos-format.ts` | `formatTodosList` (human), `formatTodoForModel` (model — **carries the `<kanban board/task>` binding**), `hasOpenTodos`, `hasKanbanBoundTodos` |

### How todos reach the model — the "chat history" question

Three distinct injection points, all gated on `hasOpenTodos`:

1. **`agent-loop.ts:610-627`** — when the leader tries to end a turn with open
   todos, up to **two** steer messages are queued containing the canonical list
   via `formatTodosForModel`, plus (when bound) the instruction that each
   `<kanban board/task>` must be resent verbatim. Bounded at 2 so it cannot loop.
2. **`agent-response.ts:90-130`** — the `[nextsteps_gate]` block: open todos
   suppress `<nextsteps>` entirely, carry a capped snapshot (`MAX_TODO_SNAPSHOT_ITEMS`)
   rendered with `formatTodoForModel`, and restate the reconcile requirement.
3. **`session-kanban-sync.ts:notifyTodoUpdate`** — when another agent mutates the
   board, a `[KANBAN TODO UPDATE]` block is appended to the last user message
   (falling back to a new message), and a human-readable summary goes to the
   session mailbox — `@session:<id>` targeted, never `to: '*'`, after
   cross-session todo bleed.

Rendering in chat history: `tool-summary.ts:100` collapses a todo call to
`"8 todos · 3 done · 2 in-progress"` (with a hand-transcribed browser copy for
the HQ dashboard, kept honest by `tool-summary.parity`). The TUI additionally
gates the NEXT STEPS panel and the suggestion store on the same `hasOpenTodos`
predicate (`tui/src/components/history/entry.tsx:183`) so the host callback and
the render path cannot disagree.

### The projection contract

With a managed board bound, a todo row is **not** independent state. `todo.ts`:

- resolves the board from `ctx.currentKanbanBoardId` → `ctx.meta.kanban.boardId` → first row's binding;
- deduplicates rows by id, preferring the bound row over a stale unbound twin;
- binds rows to cards by, in order: requested `kanbanTaskId`, task id, `origin.taskId`, normalized-title match against unused leaf cards;
- **recomputes `blockedBy` from the board** — never trusting a model-supplied value;
- demotes a blocked `in_progress` row to `pending` with the board's own reason;
- **creates a real card** for any row that still matches nothing, then rebinds by returned id (not by re-running the fuzzy match);
- walks a completed-but-never-started card `backlog→todo→running` before `mark_assignment(completed)`, because the managed auto-transition only fires from `running`;
- rolls up composite parents once every child is Done — parents are absent from the compact list, so without this all visible work can be complete while the board stays open on an invisible parent;
- refuses to yank a card out of Review or Done from a todo row, and says why;
- rolls plan/task parents up **from accepted card state**, under `withFileLock`, matching exact stored ids.

Omission is explicitly *not* cancellation: unfinished rows omitted from a shorter
list are retained (`todoIdentity` namespaces the comparison so a plan-promoted
row and a same-id todo cannot collide).

The reverse direction (`session-kanban-sync.ts`) filters archived, merged and
composite-parent cards, orders by column → priority → order → createdAt with a
dependency-respecting topological pass (`orderTasksForTodos`), and guards on
session ownership (`session:<id>` tag) so a foreign board cannot project into
this session's list.

---

## 4. Managed lifecycle

Opt-in, per board. Five stages pinned to columns and statuses
(`stage-helpers.ts`):

| Stage | Column (default) | Status |
| --- | --- | --- |
| backlog | `backlog` | `pending` |
| todo | `todo` | `ready` |
| running | `in-progress` | `in_progress` |
| review | `review` | `review` |
| done | `done` | `completed` |

Cards move **one step at a time**; `from === 'done'` is terminal. A refused
transition throws `KanbanLifecycleError` carrying structured issues through a
control-character envelope that the IPC client reconstructs
(`lifecycle-error.ts`), and `stripLifecycleIssues` removes it before any human or
model sees the message — with a guard against the envelope being stacked twice.

Forward transitions additionally validate: required card details
(description, assignee, `childTaskIds` when `atomic`, `successCriteria`),
review evidence (`assignment.lastResult`), Done evidence (definition-of-done +
reviewer `action` text), the parent/child gate, and the destination column's WIP
limit — counting only non-tombstone occupants, so an archived card cannot wedge a
column at its limit.

`assertManagedTaskPatchAllowed` makes lifecycle metadata immutable outside
`transitionTask` and refuses to revive an archived card by patch.

**No gate is a dead end** is an explicit, tested invariant
(`kanban-no-dead-ends.test.ts`): `dependsOn: []` clears a mistaken dependency,
`atomic: false` un-strands a childless parent, `remove_check` drops a criterion
that no longer applies, and `release_managed_lifecycle` returns the whole board to
plain tracking keeping cards and history.

---

## 5. Verification and parking

`verifyTaskCompletion` is deterministic by default and runs **outside** any
`mutateBoard` closure. Eight plugins; the tool deliberately offers only the six
the default registry can execute (`manual`, `command`, `test`, `file_exists`,
`file_matches`, `git_diff`, `metric`) — pinned by
`kanban-executable-criteria.test.ts` so the tool can never offer a criterion type
nothing can run.

Hard-won details now encoded:

- **`check.notes` is input, never output.** Both write-back sites leave it alone; the outcome lives in `verificationReport.checks[]`. Overwriting it made an executable criterion single-use.
- **File-scope mismatch fails the verdict.** `scopeMatches` was computed and rendered but never consulted; a task could pass while touching unrelated files.
- **A failed subtask fails the parent.** `subtasks.failed` was written and never read.
- **The git baseline is real.** `captureSnapshot` writes a `write-tree` of the full tracked+untracked worktree under a temporary `GIT_INDEX_FILE`, and `diffSince` diffs tree-to-tree — pre-existing uncommitted work no longer pollutes the scope check.
- **Command execution is gated three ways**: base-command allowlist, shell-operator rejection, hard blocklist, project-root cwd pin, bounded output, and a Windows `taskkill /T` process-tree kill on timeout.
- **Escalated (agent/council) verdicts must cite evidence** — `EvidenceValidator` rejects bare "passed" and vague summaries, with `minRefs: 2` for council.

**Parking** (`completion-park.ts`) is the answer to "the gate can say no forever":
a refusal is counted on the card, and at the budget (default 2) the card is
parked with the gate's own words. Deliberately narrow — only
`acceptance-criteria-incomplete` and `parent-child-incomplete` spend the budget,
because a missing `transitionAction` is a caller-side typo the message already
explains. Board-kind asymmetry is intentional: legacy parks take
`status: 'blocked'`, managed parks stay in Review with `task.park` alone carrying
the signal (writing `blocked` there would desync stage from column).

---

## 6. Dispatch: three paths, one service

`manager/dispatch.ts` is the shared primitive set — reserve, start, complete,
fail, cancel, heartbeat — every operation fenced on `expectedLeaseId`, and
completion **never** auto-advances to Done.

| Caller | Entry | Notes |
| --- | --- | --- |
| Director fleet | `kanban_queue` (`director-tools.ts:340`) | heartbeat = half the lease TTL, `effectiveLeaseTtlMs ≥ 2× heartbeat`, awaited runs extend the lease past the task timeout + 60 s |
| WebUI | `kanban.task.dispatch` → `kanban-dispatch.ts` | checks `areDependenciesMet` and enforced atomicity before reserving; 30 min lease |
| Supervisor (agentic) | `kanban-supervisor.ts` | only when the board opts in *and* the health snapshot has an anomaly, behind a cooldown and a watchdog |

A lifecycle transition that fails **after** the lease-fenced assignment already
committed is not swallowed: `recordLifecycleTransitionFailure` writes a stderr
line, emits `task.lifecycle_transition_failed`, and returns a structured
`lifecycleTransitionError` so the caller can surface the divergence.

`recoverStaleTaskAssignments` handles two staleness signals — an expired lease
**and** a stampless assignment that has gone silent (the state the retry path
itself produces; skipping it meant a dead agent locked a task for good). On
managed boards it preserves the lifecycle stage, keeps `assignee` (a required
card detail — deleting it walked cards into a Todo they could never leave), and
collects ids to walk back to Todo *after* the mutation commits, since
`transitionTask` cannot nest inside `mutateBoard`.

---

## 7. Queue semantics

`classifyTaskForQueue` produces one of 15 buckets with reasons. The three
readiness authorities are held in agreement by
`queue-startability-agreement.test.ts`: `missingManagedDispatchDetails`
(classifier), `validateRequiredCardDetails` (lifecycle), and
`evaluateContractGraphReadiness` (the gate `start_task` consults). `dueDate` and
`labels` are deliberately **not** required by any of them — the Cleaner still
lists them as advisory.

`queue-anomalies.ts` is the single definition of "worth looking at", published on
its own subpath so the browser bundle does not pull in `node:net`. Counts
deliberately overlap; surfaces must branch on `hasKanbanQueueAnomalies`, never on
the magnitude.

`getKanbanWorkbench` is a bounded Now/Next/Blocked/Review projection across
boards, exported as a pure function (`buildKanbanWorkbench`) so every UI tests the
same semantics. Duplicate-title alerts skip session mirrors, because mirroring a
todo is not a duplicate.

---

## 8. Surfaces

- **Agent tool** — 58 actions, one enum, one type union, one handler dispatch. Verified in this pass: schema enum ≡ `KanbanAction` union ≡ handler `case` coverage, zero drift in either direction. Operational failures **throw** (the executor only records a failure on throw); data outcomes (`claimed: false`, a gate verdict, `recoveredTasks: []`) return with `ok: true`.
- **External MCP** — four tools in three tiers (`kanban_read` + `kanban_watch` by default, `--writable` adds manage, `--destructive` adds delete/merge/transfer). `KANBAN_READ_ACTIONS` ≡ `KANBAN_READ_ONLY_ACTIONS` verified equal (13 each). `kanban_watch` is a bounded long poll whose result is a wake-up hint, not a snapshot.
- **CLI** — `/kanban` (+ `/kb`, `/board`) with 13 top-level and ~25 `task` subcommands; `/todos` with a managed-projection guard on clear/add/remove/done-all.
- **TUI** — `/kanban` slash (open, create, add, use, boards, health, audit), `/flow` workbench, F12/Ctrl+Y panel, and a pure board audit with 11 verdict codes.
- **WebUI** — 28 components, five view modes (focus/board/tree/contracts/dashboard), 50 `kanban.*` message types, a zustand store with envelope-shaped handlers, and a verification-spinner TTL sweep so a cancelled verification cannot leave a ghost.
- **HQ** — per-board records merged by `(revision, timestamp)`; a stale writer never wins. Oversized boards are skipped with a named warning and retried later rather than silently poisoning the whole frame, chunked at 512 KB against a 750 KB per-board reject threshold, with chunk ordinals so the offline queue cannot evict all but the last chunk.

### Run mirrors

`kanban-run-mirror.ts` projects live SDD and Goal runs onto boards — one board
per SDD wave / Goal phase, linked by tags (`run:<id>`, `phase:<id>`), reclaimed
from disk after a restart, debounced at 300 ms with content stamps, and created
with `completionGate: { enforcement: 'off' }` because the run engine already
verified. The assignment overlay is diff-guarded so a per-tick event storm cannot
happen.

---

## 9. Security and governance

Three independent checks in `core/src/security/kanban-boundary.ts`, from one call
site in `tool-executor.ts`:

- **A. Governance gate** — opt-in (`tools.kanbanGovernance`, default `false`), and **only meaningful on managed boards**. Non-managed boards are skipped, not blocked: an observational board structurally cannot carry a lifecycle, so demanding governance from one produced an inescapable deadlock.
- **B. Lease fence** — always on. A stale `leaseId` blocks `fs.write*` and `shell.*`; the `kanban` tool is exempt because it has its own `expectedLeaseId` fence, which is how a stale worker resolves the situation.
- **C. Filesystem boundary** — always on. Board and task policies evaluated together; a task narrows, never widens. Candidate paths extracted from a fixed key set with per-tool overrides, canonicalized by walking up to the nearest existing parent (TOCTOU-safe for paths that do not exist yet).

The `kanban` tool itself always returns `allow` — the control plane must stay
reachable so an agent can always record evidence or start the next card.

---

## 10. The prompt contract

`instructions/shared/system/tracking.md` carries both blocks. The todo block
states the four-step status discipline and the mapping
(`pending → Todo`, `in_progress → Running`, verified `completed → Done`). The
Kanban block carries six hard conditions, the five-stage lifecycle, the
escape-hatch table for each refusal, and the evidence/hand-off rules. The
external-agent equivalent is `core/skills/wrongstack-kanban/SKILL.md`.

The framing is consistent everywhere and worth preserving verbatim: **the board
is a record of the work, not a permit for it**, and **the board follows the work;
the work does not wait on the board**.

---

## Findings

Six survived verification. Four candidates were investigated and **discarded**:
`configure_contract_graph` missing from MCP (parser artefact — it is in the
manage tier, `policy.ts:59`); a signature mismatch in
`applyManagedKanbanBoardToTodos` (the wrapper exists,
`session-kanban.ts:901`); `assignTask` returning null on managed boards (no such
branch remains); and `kanban-board-watcher.ts` as dead code (it is a deliberate
compat alias pinned by an architecture test).

### F-1 — A parked card is invisible on every board surface (Medium)

`task.park` is read by exactly five files: `completion-park.ts` (writer),
`completion-gate.ts`, `task-readiness.ts`, `kanban-lifecycle-actions.ts`, and its
own test. It is **not** read by `classifyTaskForQueue` (no bucket, no reason
string), `getKanbanQueueHealth` (no count, no signal), `queue-anomalies.ts`, the
TUI `kanban-audit.ts`, the WebUI `kanban-cleaner.ts`, or any WebUI component.

Consequence: a managed parked card sits in Review looking exactly like a card
awaiting acceptance, and a legacy parked card is `blocked` with no stated cause.
The park record exists precisely to say *retrying this unchanged is pointless*,
and the only place that sentence currently surfaces is inside a **dependent**
card's refusal message (`dependencyIncompleteMessage`). The card's own owner
never sees it.

The prompt makes this worse by relying on it: tracking.md tells the agent "if
every remaining card is parked, say so plainly instead of reporting the work
complete" — a determination no surface reports and no query answers.

*Suggested shape:* a `parked` classifier bucket (or a reason on the existing
one), a `parked` anomaly signal, and a card badge in both audit implementations —
the parity test will hold the two copies together.

### F-2 — `kanban.board.history` is absent from the client message catalog (Low)

`KANBAN_CLIENT_MESSAGE_TYPES` (`kanban-route-protocol.ts`) lists 50 types.
`kanban.board.history` is handled at `kanban-board-routes.ts:242`, sent by
`kanban-store.ts:84`, and dispatched by `ws-handlers.ts:709` — but is not in the
list.

The other two handled-but-unlisted types are correct: `kanban.meta` and
`kanban.run.start` belong to the *host* route table
(`kanban-host-routes.ts`), which is a separate surface. `kanban.board.history` is
in the same table the catalog describes.

Impact is latent today — the constant is only re-exported
(`webui-server/src/server/index.ts:279`), and `isRegisteredMessageType` admits
any `kanban.*` prefix — but the two parity tests only assert list → handled, so
they cannot catch an omission in this direction, and any consumer that treats the
list as an allowlist would silently drop board history.

### F-3 — KanbanView polls three intervals on top of the push channel (Medium)

`KanbanView.tsx` runs `kanban.get` + `kanban.health` every **5 s**, `kanban.list`
every **8 s**, and `kanban.workbench` every **15 s**, for every open Kanban tab.

The justifying comments describe an architecture that no longer exists:

> "the server broadcasts kanban.get via a file watcher whenever the board JSON
> changes on disk"

There is no file watcher and no board JSON. `subscribeKanbanDaemonEvents`
replaced it with daemon push, per-board trailing coalesce at 300 ms, and a full
reconcile on reconnect — precisely so periodic refresh would not be needed. Each
5 s tick is a full `getBoard` plus a full-board fan-out to every connected
client, and each `kanban.health` recomputes classifications for every task on
every board in scope.

This also runs against the project's own "terminal stays quiet — no periodic
repaint" rule. The reconnect reconcile already covers the case the poll was
written for.

### F-4 — Board creation policy depends on which door you came through (Medium)

| Surface | Result |
| --- | --- |
| WebUI `createBoard` (`KanbanView.tsx`) | **managed** — hard-codes `lifecycle.mode: 'managed'` with the default column map |
| CLI `/kanban create <title>` | plain board, no lifecycle |
| `ensureSessionKanbanBoard` | plain `session_mirror` |
| `kanban create_board` tool action | plain unless the caller passes a lifecycle |

So the same user intent — "make me a board" — produces a strict-gated board with
adoption audit fields and a `strict` completion gate, or an ungated one, decided
by the surface. A WebUI-created board silently demands description + assignee +
success criteria + one-step transitions from an agent that was given no signal
that this board differs from the one the CLI just made.

Adoption is otherwise a deliberate, audited act (`adopt_managed_lifecycle`
requires an actor and a comment and is documented as having no slash subcommand);
this path bypasses that deliberation.

### F-5 — The prompt states a stronger parking rule than the code implements (Low)

tracking.md, Kanban hard condition #6:

> "**Every refusal** from the completion gate or a `done` transition is counted
> on the card, and at the second one the board parks it"

Implementation: `BUDGETED_REFUSAL_CODES` is exactly
`{ acceptance-criteria-incomplete, parent-child-incomplete }`. A refusal for a
missing `transitionAction`, an exceeded WIP limit, an unmet dependency, a
stage mismatch or a missing card detail counts nothing.

The narrowing is right and well argued in `completion-park.ts` — parking a card
for a typo would punish the caller and hide the real instruction. The prompt
should say what the code does, or an agent reasoning about its remaining budget
reasons from a false model.

### F-6 — Two resolution notes in the 2026-07 audit no longer describe the code (Low)

`docs/kanban-architecture-audit-2026-07.md`:

- Finding #2's resolution: "`claimReadyTaskOnBoard()` returns `null` when `board.lifecycle.mode === 'managed'`". Current `_internal.ts` has a full managed branch that claims cards in the `todo` stage, preserving routing metadata and emitting `task.claimed`.
- Finding #7's resolution: "`assignTask()` returns `null` for managed-lifecycle boards". Current `assignTask` has no managed check at all; it writes the assignment and leaves status/column to the lifecycle.

Both behaviours were superseded by the Phase 0-4 program recorded lower in the
same file. The resolution table is the part a future reader trusts, and it now
asserts the opposite of the code.

---

## What is in good shape

Worth stating, because it is most of the system:

- **One authority, enforced structurally.** Not a convention — clients cannot open the database, and the operation allowlist is the same constant the server dispatches on.
- **Every "why" is written down.** The comment density in `completion-park.ts`, `session-kanban-sync.ts`, `prune.ts` and `kanban-hq-sync.ts` records the failure each guard exists for. That is the reason this analysis could reconstruct intent without archaeology.
- **Duplicated rules are pinned by parity tests** rather than hoped about: cleaner ≡ audit, tool check types ≡ registry plugins, MCP read tier ≡ tool read-only list, six executor hosts ≡ one config key, browser tool-summary ≡ node tool-summary.
- **Escapes are treated as a first-class requirement.** "No gate may be a dead end" is a tested invariant, not a slogan.
- **Failure paths are observable.** Lifecycle divergence after a committed lease write, mirror failure drained into the next tool result, HQ oversized-board skip, event-log trim failure — each has a named warning code or an event.

## Limits

Static read plus the two suites above. Not exercised: a live multi-agent fleet
dispatch against a real provider, the TUI panel under a PTY, the WebUI against a
live server (the Chromium harness from 2026-09-15 renders components without a
backend), HQ against a real hub, or the full release gate. Findings F-1 through
F-4 are structural and grep/read-verified; F-5 and F-6 are text-vs-code
comparisons.

---

## Resolution

All six findings were fixed in the same session as this analysis, each with a
regression test. This section exists because F-6 above is precisely the failure
of an audit document that records findings and never records what happened to
them — a future reader would otherwise have to re-derive it.

| # | Status | Where |
| --- | --- | --- |
| F-1 | ✅ Fixed | data: `manager/task-classifier.ts`, `manager/assignment.ts`, `types-operations.ts`, `queue-anomalies.ts` · audit: `tui/src/kanban-audit.ts`, `webui/src/lib/kanban-cleaner.ts` · display: `KanbanColumnView.tsx`, `KanbanQueueHealthBar.tsx`, `tui/src/kanban-slash.ts`, 7 locales · agent-facing: `tools/src/kanban-board-actions.ts`, `webui-server/src/server/kanban-supervisor.ts` |
| F-2 | ✅ Fixed | `webui-server/src/server/kanban-route-protocol.ts` |
| F-3 | ✅ Fixed | `KanbanView.tsx` |
| F-4 | ✅ Fixed | `KanbanView.tsx` |
| F-5 | ✅ Fixed | `core/instructions/shared/system/tracking.md` |
| F-6 | ✅ Fixed | `docs/kanban-architecture-audit-2026-07.md` |
| F-7 | ✅ Fixed | `verification/refusal-budget.ts` (new), `verification/completion-park.ts`, `manager/task-factory.ts`, `manager/tasks.ts`, `tracking.md` |
| F-8 | ✅ Fixed | `tools/src/kanban-decomposition-actions.ts`, `kanban-tool-schema.ts`, `kanban-tool-types.ts`, `kanban-mcp/src/policy.ts` |

Design decisions worth not re-litigating:

- **F-1 does not re-bucket a parked card.** Parking is deliberately not a third
  status, and `queue-startability-agreement.test.ts` pins the bucket a card
  lands in. So the park is *additive*: a reason appended **last** to the
  classifier's list (existing tests assert `reasons[0]` and `reasons: []`, so
  order is load-bearing), an optional `KanbanQueueHealth.parked` bucket
  (optional because seven call sites build that record by hand), a `parked`
  anomaly signal, a parity-locked `parked-card` Cleaner code, and a card badge
  whose tooltip carries the recorded reason.
- **F-3 removed the board poll entirely** rather than slowing it down: the
  daemon event subscription already broadcasts every committed mutation and
  reconciles on reconnect. Queue health does not ride that broadcast, so it
  follows `activeBoard.updatedAt` instead. The comments the poll carried
  described a file watcher over board JSON on disk — an architecture that has
  not existed since protocol v6.
- **F-4 chose plain-by-default.** Managed mode stays an audited opt-in through
  `adopt_managed_lifecycle`, which already requires an actor and a comment, so
  all five creation paths now agree.
- **F-1 was extended to the surfaces that *decide*, not just the ones that
  draw.** `hasKanbanQueueAnomalies` already counted parked, so the WebUI health
  bar silently dropped its "Healthy" badge while showing nothing that explained
  the change — the same silent-drop defect that suite was written for. The
  parked count now also rides the `queue_health` tool's one-line `message`
  (what an agent actually reads, as opposed to the full record it usually
  ignores) and the supervisor's per-task audit lines, where a parked card
  otherwise read exactly like a merely-blocked one and invited the single
  recommendation that cannot work: re-run it.

### F-7 — The refusal budget never reset, so "fix it and try again" was one-shot

`task.verificationAttempts` was written in exactly one place (`applyGateRefusal`,
counting up) and deleted in exactly one place (`clearGateRefusals`), which only
ran when a card passed or reached Done. Nothing else in `packages/kanban/src`
even mentioned the field.

So once a card parked, its counter stayed at or above the budget forever: the
next single refusal re-parked it immediately, however thoroughly the work had
been fixed in between. `removeCheckFromTask` makes the cost concrete — that
function exists *specifically* so an irrelevant acceptance criterion can be
dropped rather than marked passed, which would be a lie — and without a budget
reset the escape it was built to provide was defeated on the very next refusal.

`clearGateRefusals` even documented the missing behaviour: "available to any path
that materially re-scopes a card — a park earned by an old contract must not
outlive it." No such caller existed.

Now the re-scoping paths clear it: adding, removing or rewriting an acceptance
criterion, and changing a card's title, description or children.

Two design constraints shaped the fix:

- **`successCriteria` is not a trigger.** `verify_completion` writes the whole
  array back on every run (with updated statuses), so keying the reset on that
  field would reset the budget on each verification and leave the gate unable to
  park anything at all. `updateCheckOnTask` resets only when a criterion's
  `description` or `type` changes — what it *asserts* — never when its status is
  ticked.
- **The rule lives in a new leaf module** (`verification/refusal-budget.ts`,
  types-only imports). `manager/_internal.ts` re-exports `task-factory.ts`, and
  `completion-park.ts` imports `_internal.js`, so importing the old location
  from `task-factory.ts` would have closed a cycle. A leaf keeps one definition
  instead of four copies of two `delete` statements.

### F-8 — An agent could propose a decomposition but never resolve it

`resolveDecompositionProposal` is three phases: mark the proposal approved,
**create the child cards**, then stamp `applied` with their ids. `approved` is
an intermediate state; `applied` is the terminal one.

The tool exposed `propose_decomposition` and no way to resolve it, and its own
message told the agent: *"It can be approved from the WebUI or via
update_task."* Both are dead ends, and the second is actively harmful —
`applyTaskPatch` accepts `decomposition` as a raw overwrite, so writing
`status: 'approved'` records an approval while skipping the phase that creates
the children. The card then also stops showing as pending (the WebUI badge keys
on `status === 'proposed'`), so it silently leaves the approval queue with
nothing split.

`approve_decomposition` / `reject_decomposition` now call the real path, mirroring
the WebUI's two message types. They reuse the existing `subtasks` field for
approval-time edits and `note` for a rejection reason, and sit in the MCP
`manage` tier beside `split_task` — approving creates cards, it does not destroy
any.

### The reachability audit (G-1 … G-3)

F-8 raised a general question worth answering properly: **can an agent holding
the `kanban` tool do everything the board supports?** The 76-entry domain-op
allowlist was diffed against the tool's action surface. Most apparent gaps were
not gaps:

| Op | Verdict |
| --- | --- |
| `evaluateTaskContractGraph` | Reachable — `get_contract_graph` with a `taskId` |
| `releaseTaskClaim`, `finalizeTaskCompletion` | Reachable via `release_task` / `mark_assignment` |
| `getBoardWithLivePresence` | Not a gap — `get_board` already returns live presence |
| `attachVerificationReport` | Deliberately server-only: the run mirror translating an SDD outcome, documented as never changing task status |
| `recordTaskFileActivity` | Deliberately server-only: wired by the file tools, and non-mutating on purpose so reads do not make a card look edited |
| `createBoardsFromPhaseGraph` | Deliberately engine-driven; `create_from_graph` covers the single-graph case |
| `reconcileKanbanBoard` | Deliberately server-only — "intentionally LLM-free so a quiet supervisor can run frequently" |

Three were real, and are now closed:

- **G-1 — `events` could not be scoped to a card.** The only route to a card's
  own history was the whole board log, and the transcript serializer caps list
  fields at 100 most-recent entries, so on a busy board an older card's events
  fell outside the window with no argument that could recover them.
  `listTaskActivity` filters the same log at the source; `events` now takes
  `taskId` (id or unique prefix) and re-reverses to stay chronological.
- **G-2 — an agent could not record activity.** `kanban.task.activity.add`
  existed for the WebUI, so a card's durable "what was attempted and how it went"
  stream was only ever written by a human watching the board. `record_activity`
  adds it, with the typed `kind`/`outcome` vocabulary the domain already had.
- **G-3 — board history was unreachable.** It is a separate global log that
  deliberately survives board deletion — the only way to answer "what happened
  to the board that is no longer here" — and the WebUI has read it since
  protocol v6. `board_history` adds it as a read-tier action.

One asymmetry is recorded rather than fixed: managed boards have an agent-facing
repair verb (`repair_managed_projection`) and plain boards do not, because plain
-board drift repair is `reconcileKanbanBoard`, which is intentionally LLM-free
and runs from the supervisor.

Adding an action means updating **three** lists that a parity test pins
together — the schema enum, the `KanbanAction` union, and the `kanban-mcp` tier
lists (`policy.test.ts` asserts read ∪ manage ∪ destructive equals the schema
enum, each exactly once) — plus `KANBAN_READ_ONLY_ACTIONS` for a read action,
and the serializer's bounded-list set for any new list-shaped output.

New tests: `packages/kanban/tests/parked-visibility.test.ts`,
`packages/webui-server/tests/kanban-message-catalog.test.ts`, plus cases added
to `packages/cli/tests/kanban-cleaner-parity.test.ts` (the parity corpus asserts
every vocabulary code is actually emitted, so `parked-card` needed a case in
both the legacy and managed shapes), `packages/cli/tests/kanban-queue-health.test.ts`,
`packages/tui/tests/kanban-slash-health-numbers.test.ts` and three WebUI
component suites.

Verification, after the F-7/F-8 and G-1…G-3 passes: `pnpm typecheck:only` exit 0
(the new leaf module keeps the import graph acyclic), `biome check` exit 0,
`pnpm lint:i18n` clean, `pnpm check:rulebook` OK, WebUI jsdom suite exit 0 with
5442 tests passing, `packages/core` 779 files / 12556 tests passing (the prompt
edit), `packages/tools` + `packages/kanban-mcp` 261 files / 3707 tests passing
(the new actions and the parity lists), and the root suite at **43816 tests
passing with no Kanban file failing**.

Nothing in this work failed. What did fail, across four full root runs, was a
*different* file each time — and each proved to be someone else's in-flight work
or a load flake, never a Kanban regression:

- `packages/cli/tests/slash-suggest.test.ts`, then the `next-steps` trio
  (`next-steps-slot.test.ts`, `next-steps.test.ts`, `next-steps-tool.test.ts`).
  `git status` showed all six sources and tests carrying uncommitted edits; by
  the final run every one of them passed again. That is what a concurrent
  editing session looks like from inside a test run.
- `packages/cli/tests/hq-mailbox-mutation.test.ts` failed one assertion under
  full-suite load (`expected 400 but got 404` — the gateway route was not
  registered yet) and passes **31/31 in isolation**. A pre-existing startup race
  in the HQ area, untouched by this work and left alone deliberately.
- `packages/tools/tests/codebase-index-daemon-perf.test.ts` failed both cases in
  the final run — not on a timing assertion but on `codebase-index server
  connection closed`, the detached daemon's socket dying mid-benchmark, with the
  second case cascading through the circuit breaker. The file contains zero
  references to Kanban, passes outside full-suite load, and sits beside an
  uncommitted edit to `codebase-index/codebase-skeleton-tool.ts`. Worth noting
  honestly: in isolation one of its two cases is *skipped*, so an isolated run
  does not reproduce the loaded conditions exactly.

The lesson worth keeping: on this tree a single red file in a full run is not
evidence until it has been re-run in isolation and checked against
`git status`.

**Both load-sensitive failures were subsequently fixed, and a full root run is
now green end to end (43818 passing, zero failing files).**

- `codebase-index-daemon-perf` — `bench-pairing` already documented that an
  unusable sample on a loaded box must SKIP rather than turn the suite red, but
  that contract only wrapped the *measurement*. The daemon died inside
  `runStartupIndex`, before the guard was reached, and the breaker it tripped
  leaked into the next case. The guard now extends to setup (still throwing
  under `WRONGSTACK_BENCH_STRICT_PAIRING`), and the breaker is reset per case.
- `hq-mailbox-mutation` — the 404 was a vanishing daemon, not a timing problem.
  A session lease lives 30s and is renewed every 5s; under full-suite starvation
  six missed heartbeats expire it, `queryLiveLeases` reaps it, `listLive()`
  empties, and with no client connected the daemon stops after its 250ms
  disconnected grace and deletes its metadata — after which the registry's
  never-spawning probe correctly finds nothing and the gateway reports 404
  "Unknown project". The test now holds one connection to that daemon;
  `scheduleIdleStop` returns early while `clients.size > 0`, which removes the
  mechanism instead of racing it. Three earlier passes had tried timing-side
  hardening and the flake survived all of them. Note that
  `WRONGSTACK_SESSION_CATALOG_IDLE_MS` cannot substitute: the disconnected grace
  is `Math.min(idleMs, 250)`.

One measurement correction worth recording: an earlier run in this session was
reported as "WebUI jsdom suite, 3047 files / 43754 tests". That figure was
wrong — invoking `vitest` from `packages/webui` had resolved the **root**
config, so it was a second root run (708 s, same shape as the root suite). The
real WebUI jsdom suite is 5442 tests in ~148 s. The root config excludes
`packages/webui/**` deliberately, so the two suites must both be run.
