# SAGE Deferred Backlog — Phase 4 Concurrency & Phase 3 Leftovers: Implementation Plan

> Status: **PLAN COMPLETE — H6, H9, H2, and H4 landed 2026-09-15** (C1/C2/H5 were already fixed in source).
> Round: 20260915-r6-sage-phase4-design. Every current-state claim below was
> re-verified against source on 2026-09-15; the 2026-07-30 scan line numbers
> are stale in several places and are not used here.

## 0. Current-state summary (verified in source, 2026-09-15)

| Item | Status | Evidence |
|---|---|---|
| C1 nextId wrap | **DONE** | `project-server-client.ts`: `this.nextId = id >= Number.MAX_SAFE_INTEGER ? 1 : id + 1` with the 2^53-collision comment |
| C2 IPC auth | **DONE** (WS-028) | Token read from owner-only `server.json`, stamped on every `request` + `shutdown`; server-side equality gate (`project-server.ts:583`); client invalidates + retries (13 × 150 ms) on `UnauthorizedSageRequest` |
| H5 shutdown drain | **DONE** | `stop()`: WS-059 metadata ordering, unsettled requests answered with `SageServerStoppingError` before socket destroy, active controllers aborted, `activeDispatches` drained via `Promise.race([allSettled, SHUTDOWN_DRAIN_GRACE_MS = 1 s])` before `store.dispose()`, bounded 500 ms `server.close` fallback |
| H4 drain-aware writes | **IMPLEMENTED 2026-09-15** (server cap pre-existing; client cap landed) | server `writeEncoded` 8 MB guard + client-side `MAX_SERVER_WRITE_BUFFER_BYTES` guard + destroy in `project-server-client.ts` `write()`; spec `packages/sage/tests/project-server-client-write-cap.test.ts` (3 tests); client-behavior suite 13/13 green |
| H2 single-transaction accept | **IMPLEMENTED 2026-09-15** (residual crash-window sweep) | `reconcileAcceptedCandidates` in `sqlite-store-candidates.ts`, wired in `SqliteSageStore.initializeOnce`; spec `packages/sage/tests/sqlite-candidate-reconciliation.test.ts` (4 tests); sqlite cluster 153 tests green |
| H6 counter reconciliation | **IMPLEMENTED 2026-09-15** | `mergeLiveCounterFields` in `store-helpers.ts`; wired in `SqliteSageStore.upsertMemory`; spec `packages/sage/tests/store-helpers-counter-merge.test.ts` (9 tests); targeted sqlite cluster 14 files / 167 tests green |
| H9 dispatch schema validation | **IMPLEMENTED 2026-09-15** | `SAGE_DISPATCH_FIELD_SPECS` + `validateDispatchArgs` + `SageInvalidArgsError` in `project-server-protocol.ts`; wired at the `dispatch()` head in `project-server.ts`; matrix spec `packages/sage/tests/project-server-args-validation.test.ts` (7 tests, generated from the spec table); project-server cluster 11 files / 54 tests green |

## Constraints (all items)

- Single synchronous `DatabaseSync` connection; `SqliteMutationQueue` dual
  promise chains; WAL + `busy_timeout`. Cross-chain ordering is well-defined
  at the event loop; the SQLite writer lock serializes actual writes.
- The IPC boundary treats **same-UID processes as potentially hostile**
  (WS-028 rationale). H9 exists to make that stance consistent for args.
- The SAGE store must never be shared across the Windows/WSL boundary
  (drvfs WAL crash, 2026-09-13 — separate known hazard, unaffected by this
  plan).
- Zero new runtime dependencies.

## H6 — counter reconciliation (implement first: smallest, highest value)

> **Landed 2026-09-15**: `mergeLiveCounterFields` in `store-helpers.ts`,
> wired in `SqliteSageStore.upsertMemory` (previous-row SELECT + merge before
> the whole-column write), regression coverage in
> `packages/sage/tests/store-helpers-counter-merge.test.ts` (8 unit tests +
> 1 store-level invariant test through the real counter chain and upsert
> funnel). Targeted sqlite cluster (14 files / 167 tests) green; typecheck and
> biome clean. One implementation note: an earlier draft cast `Sage` directly
> to `Record<string, unknown>` — TS2352 (interfaces have no implicit index
> signature); the shipped version asserts the spread to
> `Sage & Record<string, unknown>` instead.

**Root problem.** `recordSqliteInjection`/`recordSqliteUse` `json_set`
advisory counters (`injectionCount`, `useCount`, `lastUsedAt`,
`lastAccessedAt`) on the counter chain, while content-chain writes
(`upsertMemory` from `rememberSage`/`updateSage`/verify) write the **whole
`data` column** from an in-memory object. A bump that commits between a
content path's row read and its write-back is silently clobbered. No torn
rows occur (writer lock), only lost advisory updates.

**Decision: merge-on-write.** In the upsert path, inside the mutation, read
the *current* row's four counter keys and carry them into the incoming data:
counts take `max(current, incoming)`, timestamps keep the newest. New
memories (no previous row) are unaffected. Implementation as a pure helper
`mergeLiveCounterFields(previousData: string, next: Sage): Sage` in
`store-helpers.ts`, called by `upsertMemory` before the statement runs.

**Rejected:** (a) single mutation chain for counters — stalls
remember/consolidate behind counter bursts and contradicts the documented
loss-tolerance trade; (b) dedicated counter columns — schema migration and
codec churn for advisory data; (c) ignore — H6 explicitly asks for the
reconciliation, and verification-driven `freshness` demotions make clobbered
`lastAccessedAt` observable in hygiene decisions.

**Files/tests:** `store-helpers.ts` (helper), `sqlite-store.ts` (`upsertMemory`
call site), new cases in `packages/sage/tests` simulating a bump between read
and write (bump must survive), existing sage suite green.

## H9 — dispatch schema validation (second)

> **Landed 2026-09-15**: `SAGE_DISPATCH_FIELD_SPECS`, `SageFieldKind`/
> `SageFieldSpec`, `SageInvalidArgsError`, and `validateDispatchArgs` in
> `project-server-protocol.ts` (single source — an initial duplicate block
> from a concurrent session was reconciled away), wired at the `dispatch()`
> head in `project-server.ts` (throws before `await ready`, so validation
> precedes every store call; the transport catch maps `error.name` onto the
> response frame's `errorName`). Matrix:
> `packages/sage/tests/project-server-args-validation.test.ts` — generated
> from the spec table (minimal-valid, unknown-field tolerance, missing args
> object, per-field omission, per-field wrong type, non-object payload, wire
> name). project-server cluster (11 files / 54 tests) green; sage typecheck
> and biome clean.

**Root problem.** Every op body is a blind cast. Malformed args produce
`TypeError`s deep inside store methods → generic error frames with confusing
messages; `undefined` fields can reach prepared-statement binds. The boundary
already defends against hostile same-UID callers (WS-028) — args validation
completes that stance.

**Decision: declarative shallow field-spec table** in
`project-server-protocol.ts` (next to the op types it mirrors):
`op → readonly [field, kind][]` where `kind` ∈ `string | number | boolean |
string[] | object | any`. The dispatch head validates required fields only
(shallow, unknown fields tolerated — same minimum-validation philosophy as
`validateMemoryShape`). Failure → `InvalidSageRequestArgs` error frame naming
the first offending field. No behavioral change for well-formed callers
(`remote-memory-port.ts`, `memory-port.ts`, the MCP/CLI surfaces).

**Rejected:** (a) full JSON Schema per op validated via core
`validateAgainstSchema` — ~30 schema documents to author and maintain for no
additional safety at this boundary; (b) ajv — new dependency; (c) leave
as-is — the error messages today leak internal stack shapes to the wire and
half-validated ops can still perform store calls before failing.

**Files/tests:** `project-server-protocol.ts` (spec table),
`project-server.ts` (dispatch head + error frame), new test file
`packages/sage/tests/project-server-args-validation.test.ts` with a
malformed-args matrix per op (missing required field, wrong type, extra
unknown field tolerated).

## H2 — accept crash-window reconciliation (third)

> **Landed 2026-09-15**: `reconcileAcceptedCandidates` in
> `sqlite-store-candidates.ts` (grace window `RECONCILE_GRACE_MS = 60 s`),
> wired in `SqliteSageStore.initializeOnce` after schema init — NOT in
> `sqlite-store-initialize.ts` as originally sketched: the sweep needs the
> audit hook, which only the store method holds. Regression spec
> `packages/sage/tests/sqlite-candidate-reconciliation.test.ts` — four cases
> through the real lifecycle (remember → candidate → crafted crash-state →
> close → re-open triggers the initialize sweep): re-link, pending release,
> annotated-untouched (timestamp preserved), grace-skip. SQLite cluster
> 153/153 green including the P0-3c promotion-race test; sage typecheck and
> biome clean. **Canonical-key correction**: the sweep matches on
> `normalizeTextKey(candidate.text)` — the shared writer key (remember dedupe
> `sqlite-store-remember.ts:75`, upsert column `sqlite-store-upsert.ts:44`,
> initialize backfill `sqlite-store-initialize.ts:110`). An earlier draft
> matched on `canonicalMemoryText`, which is only the consolidation dedupe
> key and silently missed every active memory (the relink test failed before
> the fix — that failure was the discriminator).

**Root problem (residual).** The claim-CAS redesign closed the concurrency
race: resolve paths read `status = 'pending'`, so a candidate claimed to
`accepted` is invisible to them. What remains is a **hard-crash window**:
`rememberSage` succeeds, then the process dies before the memoryId
annotation UPDATE — the memory exists, the candidate reads
`accepted` without `memoryId`, and the claim CAS makes re-accept a no-op.
Exception paths already release the claim; only process death exposes this.

**Decision: reconciliation sweep, not single-BEGIN.** On
`store.initialize()` (after schema init), select candidates with
`status = 'accepted'` and no `$.memoryId` older than a small grace window;
for each, re-link by canonical-text match against an **active** memory
(then annotate + audit); if no match, flip back to `pending` with an audit
entry (`memory.candidate_accept_reconciled`). Never auto-delete.

**Rejected:** (a) single `BEGIN IMMEDIATE` folding claim + remember +
annotate — `rememberSage` queues its own mutation internally, so folding
requires a re-entrant mutation queue (a redesign with deadlock risk, out of
proportion to a crash-window advisory); (b) pre-generating the memory id and
inserting directly — bypasses `rememberSage`'s secret guard, canonical
dedupe, and FTS sync.

**Files/tests:** `sqlite-store-candidates.ts` (sweep function, implemented),
`sqlite-store.ts` (`initializeOnce` call site, implemented), tests:
simulate a crash by manually writing an accepted-without-memoryId candidate
row, then initialize → assert re-link or pending flip + audit (implemented in
`packages/sage/tests/sqlite-candidate-reconciliation.test.ts`).

## H4 residual — client-side write cap (last: tiny)

> **Landed 2026-09-15**: `MAX_SERVER_WRITE_BUFFER_BYTES = 8 * 1024 * 1024` +
> the cap/destroy guard in `SageProjectServerConnection.write()`
> (`project-server-client.ts`). Regression spec
> `packages/sage/tests/project-server-client-write-cap.test.ts` — under-cap
> write passes through, over-cap write destroys the socket with the
> "fell too far behind on reads" error and writes nothing, destroyed-socket
> write stays silent (fake sockets via internals injection; no network, no
> dist dependency). Pending-call rejection on destroy flows through the
> pre-existing disconnect handler (`rejectPending`). client-behavior suite
> 13/13 green; sage typecheck 0 errors; biome clean. The 4-file client
> cluster run exceeded the 10-min tool window under concurrent peer load —
> the directly relevant behavior suite was run standalone instead.

**Root problem (residual).** The server caps per-client `writableLength` at
8 MB and destroys slow readers, closing the owner-heap hazard. The client's
own write (`project-server-client.ts:652`) has no cap: a stalled daemon
(brokered same-UID, trusted, but a known WSL crash mode exists) grows the
client heap without bound.

**Decision: symmetric cap.** Same 8 MB `writableLength` check before
`socket.write` on the client; on breach, destroy the socket and let the
existing connect/election path reconnect (a reconnect re-reads state; no
data is lost — pending requests reject through the existing transport-death
path). Also document in the `write` docblock that the boolean return is
deliberately ignored: the cap-and-destroy is the backstop, per-write drain
awaiting would serialize callers.

**Rejected:** awaiting drain per write — changes latency semantics of every
call for a hazard the cap already bounds.

**Files/tests:** `project-server-client.ts`; test with a fake socket whose
`writableLength` exceeds the cap → destroy called, pending requests rejected.

## Ordering, sizing, sequencing

1. **H6** merge-on-write — small; independent.
2. **H9** validator table — medium; independent.
3. **H2** reconciliation sweep — small-medium; independent.
4. **H4** client cap — tiny; independent.

No item depends on another; each lands with its own tests and a green
`pnpm --filter @wrongstack/sage test` (sage has its own runner), then one
`pnpm --filter @wrongstack/sage exec tsc --noEmit` pass at the end. Total
estimated scope: ~4 focused changes + 4 test files, each landable in one
session.

## Risks

- **H6**: the merge must not resurrect counters for genuinely new memories —
  merge only when a previous row exists; and `verify`'s freshness writes must
  keep their explicit `freshness: 1` semantics (counters merge, verification
  fields come from the update payload).
- **H9**: over-validation would break legitimate callers — validate required
  fields and primitive shapes only; the protocol type remains the contract.
- **H2**: the sweep must never re-link to a non-active memory and never
  auto-delete; the pending flip is the safe fallback, with an audit entry for
  both outcomes.
- **H4**: the cap threshold must exceed any legitimate in-flight payload
  (8 MB mirrors the server and far exceeds observed frames).
- All changes stay within the existing two mutation chains; no new locks, no
  schema migration.
