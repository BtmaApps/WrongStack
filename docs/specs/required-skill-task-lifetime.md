# Required-skill task lifetime — draft specification

Status: **proposal only; not approved or implemented**. This document changes no runtime code, permission policy, journal schema, or installed dependencies. It does not authorize retrying the denied website installation.

## 1. Objective

Bind required-skill enforcement to an explicit host-owned task lifetime rather than indefinitely to a conversation. A proof-driven hunt is one task spanning all authorized rounds, pauses, compaction, and resume. After that task is explicitly closed and its execution is quiescent, an unrelated task must not inherit its skill requirements.

Expiration must never be inferred from topic wording, a markerless message, an assistant's completion claim, or a single completed hunt round.

## 2. Verified baseline

Inspected on 2026-10-04:

- `packages/core/src/skills/required-skill-gate.ts:43-50,96-100`: state contains requirements and delivery evidence but no task owner or expiry. Markerless input leaves existing state unchanged.
- `packages/core/src/core/agent-loop.ts:287-289`: real user inputs arm the gate; runtime-injected context does not arm it.
- `packages/core/src/skills/required-skill-gate.ts:138-175`: intact transcript deliveries satisfy loaded requirements; removed/elided deliveries become pending again.
- `packages/core/src/execution/tool-executor.ts:195-204`: pending requirements deny mutating tools before normal permission evaluation.
- `packages/tools/src/skill.ts:195-207`: only the last body page records a successful delivery; resource reads do not satisfy the gate.
- `packages/core/src/skills/required-skill-gate.ts:206-215`: resume reconstructs requirements from user markers and skill activations in journal order.
- `packages/core/tests/skills/required-skill-gate.test.ts:54-63,117-167`: tests pin markerless continuation, compaction invalidation, and resume behavior.
- `packages/webui/src/stores/bug-hunt-run-store.ts`: frontend campaign state tracks round/request ownership and clears after the budget is exhausted. This is UI state, not a core execution authority.
- `packages/webui/src/lib/bug-hunt-message.ts:8-10`: compact continuation instructions omit the required-skills marker.
- `packages/webui/src/hooks/ws-handlers/chat-handlers.ts:443-454`: stale request results are rejected before advancing the frontend campaign.
- `packages/core/src/types/session-events.ts`: existing `task_*` and `skill_activated` events do not encode this required-skill ownership/closure contract.

These are source observations, not claims that tests were executed for this specification.

## 3. Scope and non-goals

In scope for a future implementation:

- Task ownership and explicit closure semantics for the required-skill gate.
- Host lifecycle integration, durable replay, and stale-callback fencing necessary to enforce that ownership.
- CLI/TUI/WebUI continuation and session recovery parity.
- Regression tests for these semantics.

Out of scope:

- Changing permission grants, denial settlement, YOLO, sandbox, capability, confirmation, or allowlist behavior.
- Executing or retrying a denied command, including the website installation.
- Automatically expiring legacy journals, deleting session history, or issuing `/clear`.
- Changing hunt finding/verification criteria or deriving success from report text.
- A generalized multi-task scheduler, multiple concurrent gate owners in one context, new dependencies, or authenticated journal storage.

## 4. Terms and authority

- **Context/session:** the conversation and persisted journal, which may contain multiple tasks.
- **Task owner:** a host-generated, opaque, non-reused identifier for one authorized objective. It is not automatically a Kanban card ID, tool task ID, or request ID.
- **Hunt campaign:** one task owner spanning the configured sequence of rounds. Each round has its own request ID but shares the owner.
- **Run/request:** one agent invocation; its completion is not necessarily task completion.
- **Quiescent:** no request, queued tool call, background process, or delegated activity belonging to that owner can still execute or mutate state. Unrelated idle companions do not prevent closure.
- **Readable delivery:** existing successful full-body skill evidence still available in the model transcript.

Only the host task/campaign controller may establish, close, or bind an owner. LLM tool inputs, rendered text, frontend localStorage, mailbox bodies, and arbitrary `task_completed` events are not closure authority. Client requests must be validated and resolved to server-owned task state; a client-provided identifier alone is insufficient.

Ordinary requests submitted while a task is active do not silently replace it. They must be classified by the host as continuation/steer, queued work, or an explicit authorized task switch. The gate does not classify natural-language topics.

## 5. Required invariants

1. **One active owner per context.** A new task cannot silently replace an active or closing owner.
2. **Continuation preservation.** Markerless rounds, pauses awaiting a continuation decision, and same-task steering retain requirements.
3. **No weakening within an owner.** A subsequent marker may add or re-arm requirements, but cannot remove existing required names. Re-arming requires fresh full-delivery or unavailable evidence under existing rules.
4. **Compaction preservation.** Requirements and owner identity survive outside the transcript. Delivery removal/elision invalidates satisfaction, not ownership.
5. **Full delivery.** Partial pages, failed loads, and resource-only reads do not satisfy a skill. Existing genuine-unavailable handling remains supported.
6. **Task-bound evidence.** A late skill result from owner A cannot satisfy owner B. New owners start with no inherited loaded/unavailable evidence.
7. **No implicit expiry.** Timeouts, disconnects, model answers, per-round completion, and markerless input do not clear the gate.
8. **Explicit terminal boundary.** Successful completion, authorized cancellation, or an authorized task replacement closes the task only after owned execution is quiescent.
9. **Stale execution fencing.** Calls admitted under a closed owner cannot execute under an unrelated owner or an idle context.
10. **Permission independence.** Removing a completed task's skill requirement is not a permission grant. Every later tool still traverses all existing validators, boundaries, permissions, and sandbox rules.
11. **Durable ordering.** Lifecycle transitions must be committed before the host admits execution under their resulting state. A persistence failure must not make enforcement disappear.
12. **Conservative recovery.** Unknown, malformed, conflicting, or incomplete ownership history cannot be treated as evidence that an active requirement ended.
13. **Existing no-loader behavior.** Preserve the current executor exception when no `skill` tool is registered (`required-skill-gate.test.ts:224-229`); do not introduce an unsatisfiable loading gate. This does not grant permissions or authorize stale task execution.
14. **Bounded requirements.** Retain existing skill-name validation and the 16-name bound. If adding names would overflow an active owner's required-name union, reject that extension explicitly and preserve the active gate; never truncate away existing required names.

## 6. Minimal proposed state and transitions

Extend the gate's existing state with a task binding and lifecycle phase, rather than introducing a separate general-purpose task store:

| State | Meaning |
| --- | --- |
| `idle` | No active owned requirement; a historical closed-owner record may remain for fencing/replay. |
| `active(ownerId)` | Existing required/loaded/unavailable/deliveries data belongs to this owner. |
| `closing(ownerId)` | Closure requested; requirements remain effective while owned execution is drained or cancelled. |
| `legacy-active` | Historical marker-only behavior; no inferred expiration. |

The run/tool admission path also needs an immutable host binding to its owner. Looking up only the context's current owner when a delayed call executes is insufficient: that can accidentally rebind old work to a new task. These bindings must not be writable through model-visible tool arguments.

Proposed transition contract:

| Trigger | Required behavior |
| --- | --- |
| Host starts task A with requirements | Record A and requirements before its first mutating call. Evidence starts empty. |
| Markerless continuation of A | Preserve A and requirements; re-evaluate transcript evidence. |
| Repeated/additional marker in A | Preserve the union of required names and apply the existing re-arm semantics. |
| Full skill delivery / genuine unavailability | Update only the matching current owner; partial delivery remains pending. |
| Compaction | Preserve owner/requirements; affected deliveries become pending. |
| Round finishes with another authorized round remaining | Keep A active; bind the next request to A. No idle/unprotected window between rounds. |
| User pauses between rounds or connection drops | Keep A active and resumable. |
| Typed host campaign decision says stop or final round is terminal | Enter closing; do not use assistant report text as closure authority. |
| Owned execution becomes quiescent | Persist the matching close boundary, then retire A's gate. |
| Explicit cancellation / task replacement | Use the same closing/drain sequence; start B only after A is safely closed. |
| Duplicate/stale close, result, or delivery for A | Idempotent no-op or explicit stale denial; never clear or satisfy B. |
| New unrelated task B after A closes | B inherits neither A's requirements nor its skill evidence; normal permission controls still apply. |
| Resume active/closing A | Restore A, retain requirements, and validate deliveries against the restored transcript. Reconcile outstanding execution before admitting mutation. |
| Session reset/switch | Keep existing reset authorization semantics; no new reset path or cross-session requirement leakage. |

A single `Agent.run()` return must not perform unconditional gate cleanup: that would remove enforcement between hunt rounds.

## 7. Persistence and compatibility

Proposed additive, versioned host journal records (names are draft API, not existing events):

- `required_skills_task_started`: version, owner ID, normalized required names, and originating request binding.
- `required_skills_task_closed`: version, matching owner ID, terminal reason, and the matching host lifecycle boundary.
- Task-qualified successful skill-delivery evidence: owner ID plus delivering tool-use ID. Emit only after the final body page succeeds. Unavailable evidence must likewise be owner-qualified or safely reconstructed.

These lifecycle and delivery records must be mandatory reconstruction data at every supported session audit level, not optional diagnostic events. Append through the live `ctx.session` writer and its existing serialized write path; do not capture a stale writer or introduce a second persistence path.

Replay must validate shapes, limits, IDs, ownership, and ordering. It must not interpret text containing event-like JSON as lifecycle records. A close cannot retire another owner; activations outside their matching lifetime cannot satisfy requirements. Task lifecycle events and delivery evidence must survive transcript compaction in the same durable journal, without preserving full skill bodies indefinitely.

A valid close prevents replay of earlier markers from re-arming a finished owned task. An active start without a valid close restores enforcement. A closing task interrupted by a crash resumes conservatively and requires host reconciliation, not an assumption that its processes stopped.

Legacy marker-only journals retain the current session-lifetime semantics. Do not retrospectively classify a later ordinary prompt as a close, guess campaign boundaries, or retroactively release the prior website denial. New hosts can use the new owned protocol for new campaigns; an explicit migration design is required before adopting old active requirements.

Journal shape validation does not authenticate user-edited journal files. This proposal retains the existing session-storage trust model; implementation review must verify that lifecycle events cannot be fabricated through model/tool/transport payloads. Broader journal anti-tamper storage is not silently assumed or added here.

## 8. Host integration requirements

- Core exposes internal lifecycle operations and checks; no model-visible “clear requirements” tool is added.
- `agent-loop.ts` receives a validated owner binding for a run instead of inferring task completion from its prompt or answer.
- `tool-executor.ts` preserves the existing pre-permission gate and binds batches/nested calls to their admitted owner. Owner changes cannot legalize an old queued call.
- The skill tool records final-page evidence against the invocation's owner, not whichever owner happens to be current when the async load resolves.
- CLI/TUI hunt controllers retain the owner across continuation decisions and pauses.
- WebUI/server campaign ownership must become server-authoritative. The existing frontend round store/request guards are useful UI correlation, but clearing browser state alone must not retire a core restriction.
- All resume/switch paths use the same normalized replay logic. Read/search availability and ordinary permission-denial behavior remain unchanged.
- Diagnostic wording distinguishes active task, missing/partial skill, compacted delivery, stale owner, and legacy session-scoped requirements. It must not imply that reloading skills overrides a separate denied-command instruction.

## 9. Proposed tests — not implemented or executed

Extend `packages/core/tests/skills/required-skill-gate.test.ts`; consider a new `packages/core/tests/skills/required-skill-task-lifetime.test.ts` only if lifecycle coverage warrants separation.

| ID | Scenario | Expected assertion |
| --- | --- | --- |
| T01 | Start A with the four hunt skills | Mutation denied until every skill is fully delivered or genuinely unavailable; reads allowed. |
| T02 | Markerless round 2 / same-task steer | Owner and requirements survive unchanged. |
| T03 | Repeated marker contains fewer names / adds a name | Cannot remove old names; additional names are gated; re-arm evidence is handled consistently. |
| T04 | Round completes, next round is reserved but not sent | Gate stays active throughout the transition. |
| T05 | Pause, disconnect, ordinary topic wording, assistant “done” | None closes the task. |
| T06 | Compaction removes call/result or elides either | Owner/requirements survive; corresponding skill becomes pending. |
| T07 | Reload after compaction | Only fresh successful final-page evidence satisfies the skill. |
| T08 | Partial page, resource read, failed load, unavailable skill | Existing distinctions remain; no false satisfaction or permanent missing-skill lock. |
| T09 | Host requests closure with pending owned work | Gate remains effective until work is drained/stopped; no new task admitted. |
| T10 | Final campaign closes; unrelated B starts | A's skills no longer gate B; no evidence is inherited. |
| T11 | B's normal permission policy denies mutation | Denial remains denial even though A closed or B loaded skills; execution count stays zero. |
| T12 | Delayed tool, nested invocation, result, or skill delivery from A arrives after B starts | Cannot mutate through B, clear B, or satisfy B. |
| T13 | Duplicate/stale/out-of-order close records | Idempotent or conservative rejection; active owner cannot be dropped. |
| T14 | Crash after start; crash during closing; lifecycle persistence failure; minimum session audit level | Resume enforces requirements and reconciles owned execution; mandatory lifecycle records are retained and no fail-open transition occurs. |
| T15 | Resume A with intact versus compacted skill transcript | Respect existing readable-delivery check; skill event alone is insufficient. |
| T16 | Resume a validly closed A followed by ordinary B | Old markers do not resurrect A's requirements. |
| T17 | Legacy journal containing only markers/activations | Existing sticky behavior and compaction invalidation are unchanged. |
| T18 | Malformed owner/version/name list; forged event text; client-supplied arbitrary owner | Cannot release a gate or widen permission. Unsupported owned history fails conservatively. |
| T19 | Session switch/reset and two sessions sharing a reused context | No cross-session owner/requirement leakage; reset authorization unchanged. |
| T20 | CLI/TUI/WebUI campaign continuation, final closure, cancellation, late result | All hosts share the same core lifetime semantics; a frontend store clear alone has no authority. |
| T21 | Runtime has no registered skill loader | Preserve existing no-loader behavior; normal permission denials and stale-owner fencing still apply. |
| T22 | Active requirement union reaches/exceeds 16 names; invalid/duplicate names | Normalization and limits remain bounded; overflow cannot silently remove old requirements or drop the active gate. |

Also extend:

- `packages/tools/tests/skill.test.ts` and `packages/tools/tests/skill-activated-event-gating.test.ts`: final-page-only, owner-bound delivery and stale async completion.
- Existing tool-executor tests or the required-skill suite: ordinary permissions still run after skill satisfaction/valid closure; denied calls never reach tool execution; nested ToolFlow/tool-use calls cannot escape ownership.
- Session restoration tests at the existing CLI/TUI/WebUI-server restore sites: active/closed/legacy replay and interrupted closing.
- Host campaign tests near the WebUI run store and chat handlers: same-owner rounds, request-ID fencing, duplicate terminal notifications, and backend authority.

Use actual gate/executor implementations with mocked external tool execution and controlled async barriers. Do not copy the gate algorithm or retry the real denied npm command as a test. Temporary fixtures belong in the test suite's owned hermetic storage, with deterministic cleanup.

## 10. Acceptance and future verification

A future implementation is acceptable only when:

- T01–T22 are implemented at the appropriate layers and pass, including their negative execution-count assertions.
- Existing marker parsing, genuine-unavailable, last-page, compaction, and resume tests continue to pass; tests are not weakened to accept a fail-open path.
- One configured multi-round campaign remains protected across every round, then stops affecting an unrelated task after a valid host close.
- Legacy replay and normal permission denials remain compatible.
- No model-visible release capability is introduced, and stale/async/journal failure paths have independent review.

Proposed focused verification commands (for a future authorized implementation, **not run for this draft**):

```text
pnpm exec vitest run packages/core/tests/skills/required-skill-gate.test.ts
pnpm exec vitest run packages/tools/tests/skill.test.ts packages/tools/tests/skill-activated-event-gating.test.ts
```

Add the new lifecycle tests and the host-specific test files to the relevant runner/config once their actual paths are established. Run scoped typechecks, then the project's full test gate as feasible; report baseline versus introduced failures. Do not execute the denied website installation as part of this verification.

## 11. Review decisions and sequencing

Recommended decisions for review, not assumed current capabilities:

1. A task is a whole hunt campaign, not one `Agent.run()` or a frontend request ID.
2. Server/core host lifecycle is authoritative; natural-language topic detection is not.
3. Closure occurs only after owned execution is quiescent and its boundary is durable.
4. Legacy journals remain conservative rather than receiving inferred expirations.

Implementation review must settle the actual server-side campaign owner, transport binding, storage validation, and definition of owned background work before coding. They are not established by the inspected frontend state alone.

Dependency sequence: review authority/replay contract → add lifecycle state/events and core tests → integrate immutable run/tool/skill bindings → integrate host campaign and resume paths → adversarial/regression verification. Host adapters can be reviewed independently after the core contract is settled. This is a proposed sequence, not an executable task graph or authorization to implement.
