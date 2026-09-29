# SAGE collection, recall and evidence-based feedback

SAGE retains its existing anchors, graph relations, audience/session isolation,
relation thresholds and lifecycle rules. Model feedback is a separate advisory
signal; it never grants permission, proves a claim, raises confidence, or deletes
a memory automatically.

## Memory Companion

The fleet host now runs a lazy, read-only Memory Companion using the existing
`memory-curator` roster/model role. CLI, TUI, and the browser surfaces that share
that host use the same implementation. `features.memoryCurator: false` disables
dispatch; disabling memory/SAGE or subagents also prevents dispatch. The legacy
automatic `SessionMemoryCurator` after-run writer is no longer registered by the
CLI runtime, so there are not two competing automatic curation writers.

The companion observes injected memories and explicit stale path matches. Normal
retrieval still excludes stale records; stale matches enter only the advisory
review path. Unverified or old code knowledge is labeled as a historical hint.
Current-revision model challenges and changed content hashes also trigger review.
Unanchored preferences are not treated as code claims to verify by file reads.

Before starting a model, the host reads at most four project-contained files,
each no larger than 64 KiB, retaining at most 6,000 characters per excerpt. It
scrubs the payload and snapshots content hashes. Missing/oversized/outside-project
sources yield an unverifiable note without a model call. No network evidence or
test execution is performed in this initial read-only mode.

One task runs at a time; the pending queue is capped at eight and the host keeps
at most four conversation companions. Each live conversation gets at most four
probes for the lifetime of its companion, with a ten-minute cooldown per
memory/revision/source fingerprint. Idle residents are reused when available.
No new probes start when the injector reports context pressure of 82% or more.
Worker budgets are 8 iterations, 12 tools, 12,000 tokens and $0.15 initially;
the host separately bounds startup to 10 seconds and a task to 75 seconds.
Closing/evicting a conversation cancels pending work and terminates its resident.
Memory reads and source checks each have a ten-second waiting deadline as well;
a stuck preflight cannot hold up other queued reviews indefinitely. Underlying
filesystem/IPC work may settle later, but its late value cannot publish a verdict.

The worker returns supported/outdated/contradicted/unverifiable/irrelevant plus
source quotes. Positive and negative factual conclusions require exact quotes
from supplied excerpts. The host checks the memory revision and source hashes
again before posting a same-session note. A changed source invalidates the review;
an old revision or closed conversation cannot receive a late positive result.
Quote matching proves the quotation exists, not that the model's interpretation
is correct: every report remains an advisory model judgment.

The companion cannot edit code, mutate memory, delegate, run shell commands, or
send mailbox messages. Its provisional result is excluded from automatic role
learning. The main agent uses the existing feedback/revision-guarded update tools
after assessing the evidence; no companion result automatically changes relations,
confidence, freshness or lifecycle.

The actual subagent factory reapplies the Companion's read-only grants and budget
ceilings after project role overrides. It builds the model catalog and executor
registry from available read tools plus the host-owned `submit_result` tool;
optional index tools need not be installed. It omits the normally automatic
`session_note` tool, role-memory injection and learned role prompt additions so
provisional claims cannot bypass review or serve as their own evidence. Model
selection still honors the existing memory-curator role configuration.

## Collect durable knowledge

### Applicability conditions

Both turn-context and tool-triggered injection now run the shared bounded source
snapshot checks before rendering conditional memories. Each memory's check wait
is capped at 250ms; missing project context or timeout yields unknown. These are
ephemeral observations tagged with memory revision, check time and source hashes,
not persisted truth or a cache of correctness. Both recall paths publish injector
events to the Companion; turn events do not reset a known high-pressure pause.

WebUI creation forwards validity; the editor supports the statement and up to
four literal checks, and edits carry the revision originally opened. Detail and
injection panels show assumptions and historical check results. A result for an
older memory revision is hidden. Companion reports additionally publish a scrubbed
`memory.companion_review` event over the existing memory event channel; the UI
keeps up to 128 reports per session and shows matching-revision judgments and
quotes. Source files may change after observation, so neither panel labels a
historical observation as current verification. Refreshing the browser may lose
these transient reports; absence is displayed as no observation, not success.

`remember` accepts optional `validity`, preserved in SQLite and IPC:

```json
{
  "text": "The default retry quota is three attempts.",
  "anchors": [{ "type": "file", "path": "src/retry.ts" }],
  "validity": {
    "statement": "Applies when the default retry policy is used and no session override is configured.",
    "checks": [{ "type": "source_contains", "path": "src/retry.ts", "text": "retryQuota = 3" }]
  }
}
```

The statement describes assumptions, not instructions. Optional checks (maximum
four) look for exact literals in bounded project files. They execute no commands,
expressions or regexes. Results are `satisfied`, `not_satisfied` or `unknown`;
missing/unreadable/oversized/outside-project sources are unknown, never a claimed
disproof. A literal match is only source evidence, not proof that the current
session has no override or that the claim is true. Checks use the complete bounded
file even when the model excerpt is truncated.

Hints expose the conditions with applicability unknown. Companion receives the
conditions and structural results and forwards them with its advisory judgment;
the leader still checks the current task's assumptions. Non-applicability does
not imply global incorrectness. Conditions do not alter ranking/confidence or
automatically change memory lifecycle or relations.

Use revision-guarded `memory_update` to replace `validity`; explicit `null` clears
it. Changing conditions advances the content revision. Older memories remain
unchanged. Remember-time dedup requires matching conditions; automatic hygiene,
legacy consolidation and LLM merges skip conditional records, as does automatic
contradiction linking. Explicit reviewed relations remain supported. Tool
acknowledgments reject a backend that silently drops this field; inspect any
partially saved claim and restart the backend through the normal operator flow.

Use `remember` for one reusable finding, with concrete anchors and sources that
were actually inspected. The tool attaches the calling session to the sources.
Without explicit sources, agent-created knowledge is attributed to the session,
not to a user statement. Explicit user preferences can use `type: "user"`.
Optional tool-outcome capture also records the tool call and session IDs.

```json
{
  "text": "Admission retries use their own quota; preserve this boundary when changing the transport.",
  "kind": "convention",
  "anchors": [{ "type": "file", "path": "src/transport.ts" }],
  "sources": [{ "type": "test", "path": "tests/transport.test.ts" }]
}
```

## Recall and check current evidence

Tool-triggered recall retains a bounded semantic candidate tail for the existing
injection gates. Ordinary searches keep their original limit and ranking.
Hints expose the memory revision, update date and anchor verification date.
An unknown verification date means no date was recorded; an anchor verification
is not proof that the claim is true. Check current files/tests before relying on
old or unverified claims.

## Judge after meaningful use

Use `memory_update` with a feedback-only payload:

```json
{
  "id": "the-memory-id",
  "feedback": {
    "verdict": "outdated",
    "observedRevision": 3,
    "evidence": "src/transport.ts and the admission test now use a separate retry quota."
  }
}
```

Verdicts: `useful`, `outdated`, `incorrect`, `irrelevant`, `uncertain`.
Irrelevance refers to the task, not the memory's global value. Do not invent a
judgment merely because a memory was displayed. Supply concrete evidence after
material use or a contradiction check; do not paste secrets or raw logs.

Feedback keeps the content revision, updatedAt, freshness, confidence, useCount,
anchors and graph unchanged. The last eight distinct judgments persist in the
record; identical retries are deduplicated. Audit records also capture judgments.
The tool supplies session identity. Cross-session mutation protection applies.

`outdated` and `incorrect` judgments create non-destructive investigation
candidates in the existing review queue, including for permanent memories.
Feedback proposals carry the observed target revision. Resolving an old proposal
cannot archive/delete a subsequently corrected record; it remains pending for
re-review. Legacy proposals without a revision keep their existing contract.
The WebUI never interprets an investigation/update proposal as a deletion.
Advisory rows offer opening the target and keeping it; mixed bulk acceptance
includes only actionable proposals. The server enforces the same distinction.
Feedback and candidate creation are separate operations: if candidate creation
fails, feedback remains saved and retrying the tool is safe. Current-revision
judgments appear in hints and in the LLM triage evidence; older judgments remain
historical and are not presented as judgments of corrected content.

A retained `outdated` or `incorrect` judgment for the current revision continues
to request review even when a later judgment says useful, irrelevant or uncertain.
Hints show both the latest judgment and the factual challenge: usefulness is not
proof of correctness. A content revision change stops applying the old challenge.
This signal uses the bounded eight-judgment history; it is not a permanent dispute
ledger or an automatic change to confidence, relations or retrieval ranking.

## Correct with evidence

Read and verify the current record before correcting it. Use `expectedRevision`
to prevent overwriting a concurrent correction, and provide updated sources.
Submit feedback separately from content/lifecycle changes.

```json
{
  "id": "the-memory-id",
  "expectedRevision": 3,
  "text": "Admission retries now use a dedicated quota independent of transport retries.",
  "sources": [{ "type": "test", "path": "tests/transport.test.ts" }]
}
```

An outdated revision rejects the write with a reread instruction. Existing
callers without `expectedRevision` retain their update contract. Preserve
supersedes/contradicts relationships when replacing a decision; feedback alone
does not alter those relationships. No automatic deletion follows a judgment.

## Recover missed indexing

Boot synchronization checks coverage for the actual provider and dimensions,
repairs missing embeddings, and leaves healthy vectors untouched. A completed
marker older than 24 hours triggers a reconciliation walk on a later boot to
pick up SAGE events missed while the mirror was offline. This is boot-time
reconciliation, not a continuously running scheduler. Existing session filtering
still applies, and force sync respects a live foreign owner.

## Validation boundary

An opt-in live smoke test is available in
`packages/cli/tests/fleet/memory-companion.live.test.ts`. From `packages/cli`, run
`WRONGSTACK_MEMORY_LIVE=1 pnpm exec vitest run tests/fleet/memory-companion.live.test.ts`
(PowerShell: set `$env:WRONGSTACK_MEMORY_LIVE='1'` first). It consumes the active
profile's model quota and decrypts credentials through the existing local vault.
It creates a temporary project/SQLite store, pins the temporary curator role to
the active model, runs a fixture query through the actual turn recall middleware,
and checks pre-injection source observations, the real host,
Director, provider, evidence validator and session-note delivery to a registered
leader inbox. The fixture claims unlimited retries while the source defines a
quota. The assertion requires a contradicted/outdated report with source evidence
and unchanged memory content/revision (normal injection counters may increase).
A JSON report and worker transcripts remain in
the printed temporary project directory. Ordinary test runs skip this probe.
This checks a controlled query through recall and leader inbox delivery, not
whether a live leader model subsequently uses the advice correctly in a real task.

Tests use temporary SQLite stores and deterministic fake embeddings. They prove
the contracts, not real-model judgment accuracy or end-to-end task improvement.
Feedback is model-callable through the existing tool; this does not force every
model to invoke it or start an extra LLM after each tool call. Labeled task replay
and production telemetry are still needed to measure precision and usefulness.

The shared system instruction requests feedback before task completion after a
memory materially affects a decision or conflicts with current evidence. This
instruction is gated on `memory_update` availability; read-only sessions are not
instructed to call an unavailable write tool. It explicitly avoids per-tool-call
judgment spam and requires uncertainty when evidence is missing.

Real-daemon tests exercise the built client and server over IPC, including
feedback/review persistence after restart and concurrent correction conflicts.
If a backend silently ignores feedback (for example an older running daemon),
the tool rejects the acknowledgment before filing a review proposal and advises
an operator-controlled rebuild/restart. It does not restart active sessions.
