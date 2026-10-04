# Required-skill task lifetime — revised draft specification

Status: **proposal only; not approved or implemented**. Revision 3 resolves lifecycle serialization, transcript-occurrence binding, lost-receipt recovery, and exclusive owned-session authority. This document changes no runtime code, permission policy, journal schema, installed dependencies, or current session requirements. It does not authorize retrying the denied website installation.

## 1. Objective and limits

Bind required-skill enforcement to an explicit host-owned task lifetime. A proof-driven hunt is one task spanning all authorized rounds, pauses, compaction, and resume. Only a durably closed, quiescent task stops imposing its requirements on subsequent unrelated work.

Expiration is never inferred from topic wording, a markerless message, an assistant's completion claim, or one completed round. Closure is not a permission grant and does not revoke instructions forbidding a command retry.

This revision makes proposals for previously unresolved choices. They require review and future implementation authorization; none describes a capability already available in the runtime.

## 2. Verified baseline

Source inspected on 2026-10-04:

- `packages/core/src/skills/required-skill-gate.ts:43-50,96-100`: state has requirements and delivery evidence but no task owner or expiry. Markerless input preserves state.
- `packages/core/src/core/agent-loop.ts:287-289`: real user inputs arm the gate; runtime-injected context does not.
- `packages/core/src/skills/required-skill-gate.ts:138-175`: satisfaction checks the recorded terminal-page delivery against the current transcript; removed/elided evidence becomes pending.
- `packages/core/src/execution/tool-executor.ts:195-204`: pending skills deny mutating tools before ordinary permission evaluation, provided a skill loader tool is registered.
- `packages/tools/src/skill.ts:195-207`: only the final body page records activation; resource reads do not satisfy the gate.
- `packages/core/src/skills/required-skill-gate.ts:206-215`: restoration interprets user markers and skill activations in journal order.
- `packages/core/tests/skills/required-skill-gate.test.ts:54-63,117-167,224-229`: tests pin markerless continuation, compaction, resume, and the no-loader exception.
- `packages/webui/src/stores/bug-hunt-run-store.ts` and `packages/webui/src/lib/bug-hunt-message.ts`: frontend campaign/request state advances rounds; compact continuation instructions omit the required-skills marker. This frontend state is not a core execution authority.
- `packages/core/src/storage/file-session-writer.ts:374-435`: append can return without writing when closed, buffer ordinary events, or treat noncritical flush failures as best effort. Awaiting append alone is not a durable commit contract.
- `packages/core/src/storage/session-writer-snapshot.ts:15-29`: critical-event classification controls immediate flushing separately from audit retention.
- `packages/core/src/storage/session-store/load-session-data.ts:41,170-180,234-235`: returned raw events have a default 96 MiB tail budget and malformed JSON is skipped. That event tail is not complete lifecycle history.

These are source observations. No tests or installation commands were executed for this documentation revision.

## 3. Scope and non-goals

Future implementation scope:

- Host-owned lifetime, admission fencing, strict lifecycle commits, and complete-stream replay reduction.
- Owner/revision-bound evidence and stale-result handling.
- CLI/TUI/WebUI continuation/recovery parity and a supported journal-version boundary.
- Regression coverage for the contracts below.

Not authorized by this draft:

- Runtime implementation, changes to permission grants/denial settlement/YOLO/sandbox rules, or retrying a denied command.
- An automatic legacy-session migration, reset, history deletion, or `/clear` invocation.
- New hunt success criteria or interpreting assistant report text as host completion authority.
- A general multi-task scheduler, journal authentication, new dependencies, or assuming that arbitrary detached shell work is observable.

## 4. Authority, identity, and evidence

### 4.1 Host identity

The server/core task controller generates an opaque owner token per campaign using the project's existing ID conventions and allocates a strictly increasing owner sequence within the session generation. Authoritative owner identity is the tuple `(session generation, owner sequence, owner token)`, which is never reused. Do not infer ordering from token/ULID timestamps. Requests within the campaign have separate request IDs. An owner is not automatically a Kanban ID, tool task ID, or frontend request ID.

Every canonical record carries the complete owner identity. Replay retains the highest owner sequence plus current/most-recently-closed state, so stale identities are rejectable without an unbounded set of historical tokens. A new start must use the next sequence; old starts cannot be replayed as new enrollment. Token collisions alone cannot confer another sequence's authority.

Each owned run and nested owned tool invocation has an immutable host ticket:

- session identity and its reset/switch generation;
- owner token and owner sequence (the complete identity above);
- arming revision;
- request identity and admission identity.

Ticket fields cannot be supplied or changed through model-visible tool inputs. Client messages express intent; the server validates them against its task state. Browser localStorage, mailbox content, model answers, arbitrary `task_completed` events, or event-like JSON inside a message cannot start, close, or rebind a task.

One owner may be active per context. A later prompt must be classified by the host as continuation/steer, queued work, or an explicit authorized switch. Natural-language topic detection is not a release mechanism.

### 4.2 Arming revision

An owned task starts at revision 1. Every accepted repeated/additional required-skills marker creates revision N+1 for the same owner, preserving the required-name union. Markerless rounds retain N. Starting a new owner does not reuse the old owner's revisions or evidence.

A terminal-page delivery or unavailability result from revision N cannot satisfy N+1, even though the owner is unchanged. A tool's start ticket, not its completion-time context lookup, determines its revision. New markers reset satisfaction for the resulting union under the existing re-arm model; unavailable evidence must be refreshed as well.

Validate skill names and the existing 16-name bound before committing a revision. Overflow rejects the extension explicitly, preserves the old required set, and blocks execution of the rejected arming request. It must not truncate away old names or turn a failed update into an ungated request.

### 4.3 Paginated-evidence proposal: preserve the terminal-page heuristic

For this task-lifetime change, preserve the current loader's terminal-body-page satisfaction rule for both legacy and owned tasks. Do not add a separate page-coverage policy in this feature.

- A successful terminal body-page load is the activation evidence; a nonterminal page, resource read, or ordinary load failure is not.
- The owned evidence must match the session, owner, and current arming revision.
- Apply the existing transcript-delivery check, including its current same-batch grace when a successful result has not yet been appended.
- Removing/eliding the recorded terminal delivery invalidates satisfaction. Removing an earlier page alone does not, if the terminal delivery remains intact.
- A terminal-page request made by a new owner can satisfy that owner under the same heuristic. This is a new owner-qualified activation, not inheritance of the previous owner's loaded flag.

**Security limitation:** this heuristic is not proof that every body page was requested or remains readable. The draft deliberately stops using “full-body evidence” as an assurance. Enforcing complete page coverage would be a separately reviewed hardening change; it is not silently included here. T23–T24 pin this compatibility decision.

### 4.4 Exclusive owned-session authority

Exactly one authority may issue owned tickets or commit authoritative records for a logical owned session across **all contexts and processes**. Its exclusion key is `(canonical project, owned namespace, logical session identity)`; generation is not part of that key, so a reset cannot create a second authority beside the old one.

Proposal: a single authority service holds a supported OS/storage-backed exclusive ownership primitive and owns the sole strict writer port. Observer clients obtain no append handle or mutation-ticket issuer. A per-context mutex, per-writer FIFO, registry presence, PID guess, heartbeat, or elapsed lease timeout is not sufficient authority. A competing acquisition fails closed; uncertain ownership is not treated as availability.

Each acquisition establishes a strictly increasing, durably committed authority epoch before issuing tickets. The epoch survives authorized resets through the owned control header; it is never reset or reused. Tickets, live invocation registrations, canonical records, and receipts carry the epoch. The writer port checks current authority at record reservation and actual write; execution admission checks it immediately before granting a permit. Losing authority freezes admission and state application. Old handles/tickets cannot write or apply results through the successor.

A voluntary handoff requires draining owned work and pending I/O, closing the old writer port, then releasing exclusion. Crash takeover requires proof that the predecessor can no longer write, exclusive acquisition, and the recovery protocol in section 6.1. New admission waits for owned-resource reconciliation; acquiring exclusion alone does not prove that children or daemon-created resources stopped. No heartbeat-expiry forced takeover is supported. If a platform/storage combination cannot demonstrate exclusion and fencing, it does not support owned-v1.

Add a canonical `owned_session_authority_claimed` control record with prior/new epoch, session generation, and source boundary, committed through the sole writer path. The complete-stream reducer validates authority epochs in journal order. Historical records/evidence may remain valid under the authority that admitted them at their source position; a historical epoch never authorizes a new live callback. Only the current authority may emit a new record. Existing local-storage trust assumptions and the explicit journal-tampering limitation remain unchanged.

### 4.5 Trusted transcript-occurrence binding

Use a host-allocated `deliveryOccurrenceId`, distinct from the provider's tool-use ID. Allocate it from `(session generation, authority epoch, invocation sequence)` without reuse or counter wrap. The immutable invocation ticket binds that occurrence to its owner, arming revision, request, and admission. Do not infer its identity from a model-supplied ID or tool input.

The host stamps both the assistant tool-call occurrence and its corresponding tool-result occurrence with trusted internal origin metadata. Owned evidence records reference that exact occurrence and ticket. Raw provider IDs remain transport correlation only; they may repeat. Incoming model/client metadata cannot manufacture a trusted stamp: reserved origin fields are rejected or overwritten from the admitted invocation, not accepted from payloads.

Owned readability requires the exact trusted call/result occurrence and matching owner/revision attribution, plus the existing non-elision/success checks. It cannot fall back to raw ID, skill name, or a neighboring occurrence. Removing the current occurrence leaves the skill pending even if an older result with the same raw ID survives. Missing, malformed, or stripped attribution also leaves it pending. Snapshots, compaction, and owned journal codecs must preserve the internal attribution for retained occurrences; the binding must not be exposed as a model-writable argument.

Preserve terminal-page compatibility, not whole-body coverage. Same-batch grace is allowed only when the current authority's live batch registry proves that this exact occurrence successfully produced its terminal body page and committed activation, and its result is still awaiting append in that batch. It cannot borrow another result or survive batch retirement, cancellation, authority transfer, or resume. Historical committed activation with an intact qualified result may remain valid after resume; a missing historical result has no live-batch grace.

A live invocation registration is retired monotonically on settlement/cancellation. Duplicate or late callbacks from a retired invocation cannot commit new evidence, even when the owner and arming revision happen to remain unchanged. Delivery state must be validated both before record reservation and after acknowledgement. This requires a future owned occurrence matcher/codec; the current raw-ID-only helper is not sufficient by itself. Legacy matching is unchanged.

## 5. Lifecycle state and linearization

Proposed states, held outside transcript compaction:

| State | Mutation admission |
| --- | --- |
| `idle` | No active owned gate, established from complete valid history. Normal permissions still apply. |
| `starting(A,1)` | Closed until start has a strict commit receipt. |
| `active(A,N)` | Allowed only with a current ticket, satisfied skills or the explicit no-loader exception, and normal permissions. |
| `rearming(A,N+1)` | Closed while revision commit and old permitted mutations are being reconciled. After receipt, enter active N+1 with satisfaction reset; its loading check then controls mutation. |
| `closing(A,N,C)` | Closed for new owned mutation admission; C is a host-generated close-intent identity. |
| `recovery-blocked` | Closed because history, commit outcome, resource reconciliation, or format support is uncertain. |
| `legacy-active` | Existing legacy gate rules; cannot silently enter owned mode. |

There are two required barriers:

1. **Live admission barrier:** atomically change the phase away from active before awaiting persistence, cancellation, or resource cleanup. Recheck phase/ticket/revision after asynchronous validation or permission confirmation and immediately before granting the execution permit. Closing must not race a check of an in-flight counter followed by an unprotected enqueue.
2. **Durable lifecycle boundary:** activate a new owner/revision or retire a closing owner only after a strict matching receipt. Publishing an event to observers or changing in-memory state is not a receipt.

An accepted mutation permit is counted until execution, result settlement, and required owned cleanup are finished. Already executing work may finish or be cancelled, but its permit stays counted; closure cannot imply that an irreversible side effect was undone. Queued but not yet permitted work is rejected once closing/rearming begins.

Re-arming must reconcile already permitted mutations and owned resources capable of mutation before activating N+1 or admitting its new mutations. Pure delivery work may finish later, but phase/revision fencing prevents it from applying old evidence or reacquiring mutation admission. The new revision cannot race ongoing old-revision writes. Pending skills do not keep the phase stuck in rearming after its commit: active N+1 permits loading while its skill check denies mutation.

An ordinary call still follows existing validators, hooks, permission, and sandbox controls. Lifetime rejection must preserve existing skipped-tool/claim cleanup and denied settlement behavior. A terminal result from A cannot append into or update B's active state.

### 5.1 Closing protocol

1. Validate the host terminal/cancellation/switch decision and matching owner.
2. Under the lifecycle admission lock, enter `closing(A,N,C)` and freeze new owned mutation permits.
3. Strictly commit `required_skills_close_requested(A,N,C,reason)` before acknowledging the closure request as durable.
4. Cancel/drain only tracked activities belonging to A. Failure, timeout, or unknown liveness keeps the task fenced; it does not close it.
5. Under the same admission boundary, verify owned activity is quiescent and strictly commit `required_skills_task_closed(A,N,C)`.
6. Retire A only after that receipt. B cannot start before this boundary completes.

If step 3 fails, the live barrier remains closed and the host reports recovery-blocked; it does not return to active/idle. A crash before a close-request record becomes durable restores the last committed active state, but blocks mutation until host recovery reconciles outstanding execution and validates ongoing task authorization. Empty resource counters alone do not authorize automatic campaign continuation when cancellation intent is uncertain. A crash after the request receipt restores closing, never active by default.

Host cancellation/registered cleanup is limited to cancelling and reclaiming A's existing resources using existing authorized cleanup mechanisms. There is no model-visible `cleanup=true` flag, fresh shell-command bypass, or permission override.

### 5.2 One unsettled lifecycle transition; cancellation joins it

The exclusive session authority has one lifecycle-transition slot, separate from the admission barrier. Start, re-arm, and close transitions cannot overlap in that slot. Each has a host operation ID, expected committed owner/revision, reserved journal position when known, and an outcome: pending, confirmed committed, confirmed not committed, or indeterminate. Maintain confirmed committed state separately from desired phase/pending revision. Do not choose close-request fields from a merely proposed revision.

Cancellation always freezes new admission immediately. If start/re-arm is unsettled, queue cancellation intent against that operation and keep the barrier closed. Do not reserve a competing close-request record or acknowledge cancellation as durable yet. Resolve the prior operation first:

- If re-arm committed N+1, advance the committed-state ledger to N+1 and close that revision, even if its normal active-state application is now obsolete.
- If re-arm is confirmed not committed, retain N and close N. A not-yet-reserved re-arm may be withdrawn only when the authority can prove it cannot later write.
- If outcome is indeterminate, retain the barrier and run section 6.1 recovery before selecting a revision. No revision guessing or forced rollback.
- If a start never committed, never create a close record requiring that absent start. No owned execution may have been admitted for it; resolve/cancel the provisional enrollment without inventing a committed owner. If start did commit, close the confirmed owner normally.

When cancellation is queued, successful start/re-arm persistence does **not** briefly reopen admission. Transfer the transition slot directly to closing while retaining the same barrier. Every close-request uses the confirmed committed revision. Cancellation becomes durably acknowledged only after its close-request receipt, and completion only after its final close receipt.

An obsolete evidence/application receipt may be ignored, but an authoritative lifecycle outcome must still update the authority's committed-state ledger. Ignoring a response cannot erase a journal transition. Evidence reserved before the barrier remains ordered before the transition; no wrong-phase evidence can be newly reserved afterward. Duplicate control intents join the existing operation rather than create a second writer transaction.

## 6. Strict commit contract

Propose an internal commit operation on the existing serialized live session-writer path, not a second writer. Its receipt identifies session/reset generation, owner, arming revision, record kind, journal position/sequence, and close identity when relevant.

A receipt means the complete record was accepted by the matching open writer, written in order, and its required flush/datasync completed successfully. Start, re-arm, close-request, close, and owned satisfaction records are mandatory reconstruction data at every audit level **and** critical durability boundaries. Retention classification alone is insufficient.

Closed writer, write error, flush/datasync error, partial write, or a session swap before application must reject the operation. The host cannot manufacture a successful receipt from `append(): Promise<void>`, an observer callback, or a best-effort flush. The current writer API needs a future strict contract/implementation change; this document does not assert that an adapter can already provide it.

Every authoritative record must validate its expected phase/owner/revision and reserve its position on the serialized writer under the same admission boundary. A phase check followed by an unprotected later enqueue is insufficient. Evidence reserved before a close/re-arm may finish persistence afterward, but must precede that lifecycle boundary in journal order; a stale or wrong-phase callback cannot enqueue new authoritative evidence. State application rechecks the binding after acknowledgement and does not rebind obsolete evidence/application receipts. Authoritative lifecycle outcomes remain tracked in the committed-state ledger even when cancellation supersedes their normal application; section 5.2 governs that reconciliation.

Use the live `ctx.session` writer at transaction admission, then pin and validate that writer/session identity for the transaction. A session switch must serialize with the transaction or invalidate its receipt before state application. Do not capture a writer indefinitely across resume/switch.

Crash contract:

- After a receipt, replay must find the complete matching boundary under the supported local-storage durability contract.
- Before a receipt or after uncertain I/O, the host must not admit dependent mutation or retire the gate. Recovery is conservative.
- The proposal does not claim protection against storage rollback, user-edited files, or filesystems that do not honor the selected durability primitive. Unsupported storage cannot be advertised as supporting owned-v1 guarantees.

### 6.1 Lost-receipt recovery: records are candidates until revalidated

A caller's acknowledgement is not stored evidence of commitment. A complete record can exist although datasync failed or the reply was lost. Do not infer that it was uncommitted merely because no old receipt is available; do not treat parse success alone as a new durable receipt either.

Recovery protocol:

1. Freeze all owned execution admission. Establish exclusive authority and prove that the predecessor and its queued I/O cannot append later. If exclusion, old-writer retirement, or source stability is uncertain, remain recovery-blocked.
2. Capture the stable current-generation journal boundary and reduce the complete supported prefix. Validate operation IDs, owner/revision order, prior authority epochs, required origin metadata, and record completeness. No mutation is admitted from the provisional reduction.
3. For a known operation, classify its outcome: **candidate committed** if its complete canonical record is valid in the prefix; **candidate not committed** only if complete stable history proves it absent and no deferred predecessor write can occur; **indeterminate** otherwise. Unknown operation identity is not an absence proof. Torn/corrupt records remain blocked, not automatically truncated or converted to absence.
4. Obtain a strict recovery-prefix durability receipt covering that validated boundary. Commit the successor authority claim in order through the same writer; its successful flush/datasync may establish durability of the preceding validated prefix as well. The restricted bootstrap authority-claim operation requires exclusive acquisition and the expected prior epoch; it is not a generic bypass for ordinary writes or tool admission. No live tickets are issued before the claim receipt.
5. Apply the confirmed canonical outcomes to the committed-state ledger, then reconcile owned resources and current authorization. A recovered close may retire its owner only after this receipt and verified quiescence. An active owner remains behind recovery admission until continuation is authorized. Refresh unreadable/unavailable evidence under the existing owned rules.

The recovered receipt identifies the known operation, its confirmed committed/not-committed outcome, validated source boundary, and current authority epoch. A complete unacknowledged record that passes these steps is recovered as committed; replay does not resurrect old requirements merely because its original reply was lost. A definitely absent re-arm leaves the last confirmed revision in force. Absence of a close never implies retirement. Indeterminate outcomes keep admission closed.

No separate “ack of an ack” lifecycle record is required. Once the controlling process observes the recovery durability receipt, it may apply the result; another crash repeats validation under the next exclusive authority. Repeated recovery is idempotent within the retained outcome window and cannot append a duplicate start/re-arm/close to manufacture an acknowledgement. Older operation identities outside that window are stale, not guessed successful.

This protocol does not re-execute the old tool or external action. In particular, it cannot retry or retrospectively authorize the denied website installation. It resolves control-journal state only.

## 7. Transition contract

| Trigger | Proposed transition and execution result |
| --- | --- |
| Host starts owned A | Freeze admission in starting; commit start; enter active revision 1 with no satisfaction evidence. |
| Start persistence fails | Remain blocked; do not admit A or replace uncertainty with idle. |
| Markerless continuation / another authorized round | Retain A and N; re-evaluate terminal evidence. No unprotected inter-round interval. |
| Accepted marker re-arms/adds requirements | Freeze admission; reconcile old permitted mutations/resources; commit N+1 and its full union; enter active with satisfaction reset. |
| Revision commit fails or union overflows | Preserve the prior requirement set, reject that request, and fence uncertain execution; no truncated/ungated fallback. |
| Skill completion for A,N | Accept only a current active owner/revision ticket and strict evidence receipt. Partial pages do not activate. |
| Late completion for A,N after re-arm to N+1 | Ignore/record as stale; cannot satisfy N+1 or clear its requirements. |
| Compaction | Preserve owner/phase/revision; missing terminal evidence becomes pending. |
| Round pauses / disconnects / ordinary final answer | No closure. Recovery admission remains subject to ownership and resource reconciliation. |
| Host's final campaign or authorized stop decision | Execute the closing protocol; do not parse assistant prose to decide terminality. |
| New work attempted in closing | Reject before execution even if skills are satisfied or no loader is registered. |
| A becomes quiescent | Commit the matching close; retire A only on receipt. |
| B starts after A's durable close | New ticket/revision/evidence; no inherited A requirement or activation. Normal permission denials remain effective. |
| Duplicate close request/receipt | Return an identical retained current/last-closed receipt idempotently; older identities are stale and append no authoritative record; conflicting duplicates cannot affect B. |
| Stale tool, request result, nested call, or activation | Cannot mutate through a later owner, bind to current context, append to its conversation, or satisfy its gate. |
| Session reset/switch | Existing authorization and cancellation semantics apply; invalidate old session-generation tickets. No new reset operation is introduced. |

## 8. Canonical records and complete-stream replay

Proposed owned-v1 records (not existing APIs):

- `required_skills_task_started`: owner, revision 1, normalized required set, validated originating request identity.
- `required_skills_task_rearmed`: owner, previous/new revision, complete normalized union, triggering request identity; must increase the revision by exactly one.
- `required_skills_evidence`: owner/revision, delivering tool-use identity, terminal-page activation or genuine-unavailable outcome.
- `required_skills_close_requested`: owner/revision, close identity, validated reason and request boundary.
- `required_skills_task_closed`: matching owner/revision/close identity and completed host terminal boundary.

Owned replay uses these canonical host records. `user_input` markers remain recorded as intent/audit, but are not independently reapplied over the owned reducer; otherwise replay could duplicate re-arming or erase ownership. Live host handling validates a real user's marker and commits the corresponding start/re-arm record. Runtime-injected text is not arming authority.

### 8.1 Reducer before event-tail eviction

Reduce effective lifetime state while streaming the **complete** journal, before raw-event eviction. Return a bounded effective-state result separately from `SessionData.events`, with format/version, session generation, highest owner sequence, phase, current owner/revision/required set, matching evidence metadata, most-recently-closed owner/receipt, close identity, source position, and integrity/completeness status.

The reducer does not retain full history or skill bodies. State is bounded by the current owner, the 16-name limit, its current evidence, and necessary idempotency/fencing metadata. Old raw events may still be evicted using the existing memory budget.

Mutating resume admission requires a complete valid reduction through the declared journal boundary. Absence of a start in an event tail is not proof of idle. If completeness cannot be established, return recovery-blocked rather than an empty gate. A checkpoint optimization is not part of v1; any future checkpoint must validate its prefix/cursor and reduce the suffix without skipping ownership transitions.

### 8.2 Integrity and version rules

- Validate owned format, event fields, IDs, revisions, size/name limits, ownership, and ordering before reducing.
- A close requires the matching start, revision, and close-request record; an orphan close cannot retire a gate.
- Validate owner-sequence and arming-revision continuity using positive safe integers; reject overflow rather than reset counters. Reject overlapping/reused authoritative owner identities and unsupported records.
- Idempotent receipt handling is bounded to the current owner and most recently closed owner whose receipt facts are retained. Reject conflicting duplicates there. Older/out-of-order live requests are stale and cannot append authoritative records. An unclassifiable older duplicate encountered in the journal blocks replay rather than being guessed identical; legitimate stale callbacks produce diagnostics, not duplicate lifecycle writes.
- Corrupt JSON, incomplete trailing records, missing source segments, or uncertain classification in an owned journal marks reduction incomplete/corrupt and blocks mutation. Do not use the existing legacy “skip malformed JSON” behavior to prove owned idle.
- Recognized diagnostic records are non-authoritative; message text containing event-like JSON is never a lifecycle record.
- A resumed owned state starts behind a recovery barrier. Restore active/closing state and reconcile owned execution first; then evaluate terminal delivery readability. A skill event alone does not bypass transcript evidence checks.
- Historical unavailability is not silently treated as a current-runtime waiver after resume: require a fresh genuine unavailable result for the current owner/revision, or apply the explicit no-loader compatibility rule below.

Normalization is not authentication. The proposal retains the existing local session-storage trust assumptions and does not promise resistance to user-edited, well-formed journal data. Live APIs must still prevent model/tool/transport payloads from fabricating lifecycle records.

## 9. Explicit compatibility proposals

### 9.1 Legacy sessions: no implicit adoption

Marker-only sessions remain legacy and retain current replacement/continuation/replay semantics. Do not retrofit inferred owners, end markers, or expiration into their existing history.

Reject an owned start while `legacy-active` is present; leave legacy requirements untouched. V1 offers no in-place adoption/migration API. An independently authorized creation of a fresh owned session is the supported entry point, not an automatically issued reset. This is a storage/lifetime support rule, not permission to escape a denied command. Existing user instructions and explicit retry prohibitions still govern.

A legacy replay uses the legacy reducer; it cannot be relabeled owned merely because a new binary reads it. Legacy callers retain their unowned interfaces and are not required to synthesize an owned tuple/revision. A truncated legacy history must not be silently advertised as satisfying owned guarantees. New hosts still invalidate prior session-generation work when contexts are reused; this does not convert legacy requirements into an owned task.

### 9.2 No-loader exception: preserve it, narrow its precedence

Preserve the existing loading-check exception for both legacy and owned runtimes when no `skill` tool is registered. Do not invent loaded/unavailable evidence or clear the owner's requirements. If the loader returns, enforce current revision/readability again.

For owned execution the order is:

1. Format/replay integrity, session generation, owner/revision, phase, and admission barrier checks — always enforced.
2. Skill satisfaction check — enforce only when the loader is registered, preserving the compatibility exception.
3. All normal validation, permission, and sandbox checks.
4. Final atomic admission recheck before tool execution.

Thus a missing loader does not legalize stale execution, closing-state mutation, malformed replay, or an ordinary permission denial. Diagnostics must explicitly say that loading enforcement is unavailable, rather than claiming that all required instructions were read. Loading assertions in T01 assume a registered loader; the no-loader cases have separate assertions.

### 9.3 Pagination: terminal-page compatibility, not whole-body assurance

Adopt section 4.3 as the v1 decision. Earlier-page loss alone leaves the existing satisfaction heuristic intact; terminal-page loss invalidates it. This is a documented limitation, not an accidental claim of full coverage. No page-coverage or content-version protocol is implemented by this draft.

### 9.4 Older readers: no owned-journal downgrade support

New readers must support legacy sessions using legacy semantics. Older binaries are not supported readers of owned-v1 journals; do not assume an unknown JSONL field will make them refuse. The current old reducer ignores unfamiliar lifecycle records.

Propose a physically separate owned-v1 storage namespace beside, **not inside**, the legacy `sessions/` namespace, with its own format/version declaration and discovery/index routing. Supported old readers must neither enumerate that namespace nor resolve an owned session through their legacy path. The exact layout/routing must be demonstrated against supported old reader versions before rollout; a version field alone is insufficient.

New hosts reject unsupported owned versions before constructing an executable context. No automatic conversion, legacy fallback for owned data, or copying an owned journal into the old layout is supported. Manual file tampering/conversion is outside the guarantee. Until old-reader non-discovery and new-reader version rejection are proven, owned-v1 rollout is blocked.

This introduces a future storage/protocol integration requirement; it is not a change made to today's session layout.

### 9.5 Quiescence: tracked work or no owned-mode claim

V1 may support only activities whose admission, cancellation, settlement, and cleanup can be attributed to the immutable ticket:

- joined agent requests and tool batches;
- child processes within an observable host-managed lifetime domain;
- asynchronous skill loads/results whose state application is revision-fenced.

Detached commands, subagents, watches, hooks, or other resource types are eligible only after the host can register and prove their owned lifetime/cleanup. Otherwise refuse that activity in owned mode or decline owned-mode enrollment before starting the campaign; do not silently downgrade an active owned task to legacy.

Parent-process exit is not proof that arbitrary shell descendants or daemon-created resources stopped. Unrestricted shell work that can escape the host's observable domain cannot be assumed quiescent. A host lacking the required existing containment/tracking must not advertise support for those owned activities; this specification does not introduce a new sandbox or generalized scheduler to manufacture that guarantee.

Cancellation timeout, cleanup error, unknown liveness, or unsupported outstanding work keeps closing/recovery-blocked. No timeout-driven forced close. Unrelated agents may still mutate a shared checkout: task quiescence is not global repository isolation.

## 10. Host integration and invariants

- One server/core controller owns the lifetime; frontend round/request state is correlation only.
- A configured hunt's rounds, pauses, and recovery retain the same owner; individual `Agent.run()` completion never releases it.
- Live start/re-arm/closure transitions use the strict writer contract and admission barrier. Existing public legacy callers remain compatible; no model-visible clearing tool is added.
- Tickets propagate through tool batches, nested ToolFlow/tool-use calls, result delivery, cancellation, and cleanup. No completion-time rebinding to current context.
- Skill activation/unavailability is applied only to the matching active revision after strict evidence commit. Late or closing-phase results cannot change satisfaction.
- Session writers and complete-stream reducers are shared across CLI/TUI/WebUI-server resume/switch paths; core must not depend upward on these surfaces.
- Require the same critical records at all supported audit levels. Preserve the single live serialized writer; no direct-file side writer.
- Existing permission grants/denial settlements and reset authorization are not widened. No lifecycle event overrides a separate prohibition against retrying a denied call.

## 11. Proposed tests — not implemented or executed

Extend `packages/core/tests/skills/required-skill-gate.test.ts`; a separate `required-skill-task-lifetime.test.ts` is a proposed new file, not an existing suite. Use real reducer/gate/executor/writer implementations and controlled external boundaries; no copied algorithm or arbitrary sleeps.

| ID | Scenario | Required assertion |
| --- | --- | --- |
| T01 | Owned A with registered loader starts | No mutation before start receipt or required terminal activations/genuine unavailability; reads remain available subject to normal controls. |
| T02 | Markerless round 2 / same-task steer | Owner/revision/requirements persist. |
| T03 | Re-arm with subset/additions | Required union cannot weaken; revision increments and satisfaction resets. |
| T04 | Next round reserved but not sent | No idle/unprotected interval. |
| T05 | Pause, disconnect, topic wording, assistant “done” | No close inferred. |
| T06 | Terminal call/result removed or elided by compaction | Owner/revision persist; skill becomes pending. |
| T07 | Fresh activation after compaction | Matching current revision restores satisfaction under the terminal-page heuristic. |
| T08 | Nonterminal page, resource read, ordinary failure, genuine unavailable | No false terminal activation; only genuine unavailable qualifies in the current revision. |
| T09 | Skills already satisfied; enter closing | A fresh mutation cannot execute; satisfying skills does not bypass the phase barrier. |
| T10 | Final close receipt, then B | A's gate/evidence not inherited; B starts only after durable close. |
| T11 | B's normal policy denies mutation | Execution count stays zero; closing A granted nothing. |
| T12 | Late A call/result after B starts | Cannot mutate via B, append to B, or change B's state. |
| T13 | Duplicate/mismatched close identity | Identical duplicate idempotent; conflicting/stale close cannot retire another state. |
| T14 | Crash after close-request receipt but before close | Restore closing behind recovery barrier; do not restore active by default. |
| T15 | Resume with intact versus absent terminal evidence | Journal activation alone cannot bypass readability. |
| T16 | Complete closed A history followed by B | Old markers cannot resurrect A; owned markers not reapplied independently. |
| T17 | Legacy marker-only history | Existing legacy behavior preserved; no inferred expiration. |
| T18 | Bad owned fields/revision/authoritative event | Recovery-blocked; not empty/idle fallback. |
| T19 | Context reused across session switch/reset | Old generation tickets rejected; reset authorization unchanged. |
| T20 | CLI/TUI/WebUI rounds and terminal decision | Same core contract; frontend clear alone has no authority. |
| T21 | Loader absent or disappears | Loading check compatibility only; closing/stale/integrity/permission checks still reject appropriately. |
| T22 | Required union overflow/invalid/duplicate names | No truncation of old requirements or ungated arming request. |
| T23 | Earlier page removed; terminal page intact | Existing terminal-page heuristic stays satisfied; no full-body assertion. |
| T24 | New owner requests terminal continuation page | New owner-qualified activation follows declared compatibility rule; no inherited loaded flag. |
| T25 | Hold A,N load; re-arm A,N+1; release old load | Old success/unavailability cannot satisfy N+1, live or after replay. |
| T26 | Permission confirmation waits during closing/re-arming; old permitted writes remain in flight | Final admission rejects stale execution and preserves claim cleanup; N+1 waits for old mutations to settle, then active N+1 allows loading without allowing unsatisfied mutation. |
| T27 | Queue enqueue races quiescence check | Admission freeze/counter check has one linearization boundary; no post-check enqueue slips through. |
| T28 | Start/re-arm/close-request/close/evidence persistence fails | No dependent execution, false loaded state, gate retirement, or idle fallback. |
| T29 | Writer closed, append merely buffered, observer fires early | None yields a commit receipt. |
| T30 | Write/flush/datasync error or partial record | Receipt rejected and state blocked; error not swallowed. |
| T31 | Session writer swapped while commit awaits | Receipt cannot apply to a different session/generation. |
| T32 | Kill/crash before versus after receipt | Before: conservative reconciliation; after: matching record recoverable under supported storage contract. |
| T33 | Small raw-event budget evicts start/re-arm/close-request | Complete-stream reduced state remains correct without retaining unlimited history. |
| T34 | Malformed line/torn tail/missing segment in owned journal | Integrity status blocks mutation; a returned event tail cannot prove idle. |
| T35 | Healthy complete history truly has no active owner | Authoritative idle accepted; corrupt/incomplete history is distinguishable. |
| T36 | Replay repeated markers and revision records | Exactly one canonical re-arm per host request; no duplicate increment, reset, or stale activation acceptance. |
| T37 | Start owned B with legacy-active state | Enrollment rejected; legacy requirements unchanged; no automatic reset/adoption. |
| T38 | Old/new readers and storage discovery | Old supported readers cannot discover/resolve owned namespace; new readers reject unsupported owned versions; legacy routing unchanged. |
| T39 | Minimum audit level and cold/archive source | Required records retained and fully reduced; ordinary retention/archiving cannot remove effective ownership history. |
| T40 | Escaped/untracked work, cancellation timeout, cleanup failure | Cannot claim quiescence or emit a successful close; unsupported enrollment/activity rejected without permission bypass. |

Additional integration coverage:

- `packages/tools/tests/skill.test.ts` and `packages/tools/tests/skill-activated-event-gating.test.ts`: terminal-page/revision evidence, genuine-unavailable freshness, and stale async application.
- Tool-executor/nested-invocation tests: permit linearization, closing/re-arm barriers, hook claim rollback, no-loader precedence, and unchanged normal denials.
- File-session-writer tests: strict receipts and every I/O/closed-writer failure path, including session swaps.
- Session loader tests using its small-budget seam: streaming reduction before eviction, integrity status, namespace/version routing, archive completeness, and legacy compatibility.
- Existing host campaign and resume tests: immutable ownership across rounds, request-ID fencing, duplicate notifications, interrupted closure, and runtime resource reconciliation.

Use synthetic owned tasks and harmless mocked external execution for negative execution-count assertions. Do not retry the real denied npm installation. Fixtures use owned hermetic storage and deterministic cleanup.

## 12. Acceptance and future verification

A future implementation is acceptable only after T01–T40 pass at the appropriate layers and a second adversarial review confirms:

1. Closing/re-arming freezes new mutation admission atomically, even with satisfied skills or no loader.
2. Strict receipts mean actual matching persistence, not buffering, best-effort callbacks, or a closed-writer no-op.
3. Complete-stream replay remains correct despite raw-event eviction and fails conservatively on corrupt/unsupported owned history.
4. Owner/revision/session tickets fence both cross-owner and same-owner stale results.
5. Legacy mode, terminal-page limitations, no-loader precedence, and supported old-reader refusal/non-discovery match the explicit decisions.
6. Every supported activity has a demonstrated owned cleanup boundary; unsupported work cannot manufacture quiescence.
7. Normal permission denials and separate user prohibitions remain unchanged. No model-visible release capability exists.

Existing parsing, missing-skill, terminal-page, compaction, resume, and no-loader tests must remain compatible. Do not weaken assertions to make a fail-open path pass.

Proposed focused commands for a future authorized implementation, **not executed for this draft**:

```text
pnpm exec vitest run packages/core/tests/skills/required-skill-gate.test.ts
pnpm exec vitest run packages/tools/tests/skill.test.ts packages/tools/tests/skill-activated-event-gating.test.ts
```

Add lifecycle/writer/loader/host integration cases to their actual runners after implementation paths are established. Run scoped typechecks and the full project test gate as feasible, distinguishing baseline failures. The denied website installation is not a verification step.

## 13. Rollout prerequisites and sequence

Explicit v1 decisions: whole-campaign ownership; closing/re-arm barriers; strict receipts; stream reduction before eviction; owner plus revision freshness; legacy enrollment refusal; loading-only no-loader exception; terminal-page compatibility; separate owned namespace with no older-reader support; tracked quiescence or no owned-mode support.

Remaining engineering proof obligations are not alternative default behaviors: identify the actual server controller, strict writer extension, stable journal cursor, namespace discovery/routing, session-generation binding, and resource-containment mechanism that satisfy these contracts. If any cannot be demonstrated, block owned-v1 rollout rather than relax the invariant.

Sequence: review these explicit decisions → design strict commit/complete-stream storage contracts → implement core state/admission/replay with tests → propagate immutable tickets through run/tool/skill paths → integrate host campaigns/resources/namespace routing → adversarial and compatibility verification. Independent host adapters may proceed only once the shared core contract is settled. This sequence is not authorization to implement.
