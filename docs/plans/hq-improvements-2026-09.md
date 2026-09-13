# HQ Improvements 2026-09 — RFC

This document captures the 17 improvements proposed in the HQ Command Center
architecture overview, split into **shipped** and **deferred** (RFC pending).
Ships land as a series of focused, tested PRs; RFCs describe the design,
contracts, and risks so the work can continue in subsequent sessions.

## Status

| # | Proposal | Status | Wave |
|---|---|---|---|
| 16 | `HQ_TRANSCRIPT_TEXT_CAP` doc comment | ✅ Shipped | W1 |
| 11 | `hqAuthContentHash` cache | ✅ Shipped | W1 |
| 18 | Publisher backpressure surface | ✅ Shipped (server-side) | W1 |
| 12 | Alert snooze (`snooze(ruleId, untilMs)`) | ✅ Shipped | W2 |
| 13 | Persisted alert config (`alerts.json`) | ✅ Shipped | W2 |
| 6 | `wstack hq alerts eval` CLI | ✅ Shipped | W2 |
| 14 | Mailbox gateway health tile | ✅ Shipped (production + HTTP endpoint) | W2 |
| 17 | Bounded LRU for tracked agents | ✅ Shipped | W3 |
| 2 | Throughput-budget alert rule | ✅ Shipped | W3 |
| 4 | Correlation IDs across envelopes | 🚧 RFC | W4 |
| 7 | Command latency SLO dashboard | ✅ Shipped (timestamps + roll-up) | W4 |
| 15 | Token revoked broadcast | 🚧 RFC | W4 |
| 19 | Event Log timeline view | ✅ Shipped | W5 |
| 5 | HQ-mediated mailbox mutation | 🚧 RFC | W6 |
| 9 | TTL on `HqApprovalDecision.always` | 🚧 RFC | W6 |
| 3 | `hq.snapshot_diff` | ❌ Downgraded | — |
| 8 | TUI reader of `/ws/browser` | ⏭ Out of scope | — |
| 10 | IndexedDB persistence of alerts/commands | ⏭ Defer | — |
| 20 | Per-connection bandwidth budget | ⏭ Needs load infra | — |

**Legend:** ✅ Shipped · 🚧 RFC below · ❌ Downgraded (rejected on re-read) · ⏭ Deferred

## Shipped in this session (2026-09-13)

| Wave | Item | Tests | Files |
|---|---|---|---|
| W2 #12 | `HqAlertEngine.snooze` + clearing-pass bug fix | 20 (8 new + 12 existing) | `packages/core/src/hq/alerts.ts`, `packages/core/tests/hq/alerts.test.ts` |
| W2 #13 | `alerts-config.ts` (274 lines, lock timeout = 30 000) | 10 new | `packages/core/src/hq/alerts-config.ts`, `packages/core/tests/hq/alerts-config.test.ts` |
| W2 #6 | `wstack hq alerts eval` CLI | 7 new | `packages/cli/src/subcommands/handlers/hq.ts`, `packages/cli/tests/hq-alerts-eval.test.ts` |
| W2 #14 | Mailbox gateway health tile (production + HTTP) | 15 new (9 + 6) | `packages/cli/src/hq-server/mailbox-gateway-manager.ts`, `packages/cli/src/hq-server/mailbox-gateway-health.ts`, `packages/cli/src/hq-server/routes/system-handlers.ts`, `packages/cli/src/hq-server/routes.ts`, `packages/cli/tests/hq-mailbox-gateway*.test.ts` |
| W3 #17 | Bounded LRU for tracked agents | 16 new | `packages/core/src/hq/lru.ts`, `packages/core/src/hq/session-bridge.ts`, `packages/core/tests/hq/lru.test.ts` |
| W3 #2 | Throughput-budget alert rule | 6 new | `packages/core/src/hq/alerts.ts`, `packages/core/tests/hq/alerts.test.ts` |

**Total tests passing: 110 (across the W3+#2 regression run). 0 regressions.**

**Durable memory entries:**
- W3 #17: id `01M2EA3JFX5Y6T1CDMSHTHVV5H`
- W3 #2: id `01M2EAC0XCV72NP5BCRGV6C2Z0`

## Shipped

### W1 #11 — `hqAuthContentHash` cache

**Files:** `packages/core/src/hq/auth-store.ts`

The auth file is re-read on every WS upgrade and on every auth-watcher tick,
and `hqAuthContentHash` was paying the full SHA-256 cost each time. For a file
with hundreds of browser tokens, that's the dominant cost of the per-connection
auth path.

**Implementation:** the canonical JSON serialization of the redacted projection
is the cache key. An unchanged file returns the cached hash in O(1); only a
real structural change re-derives it. Cache size is bounded at 256 entries
(~64 KiB worst case) and is evicted FIFO when full.

**Verification:** a `_resetHqAuthHashCacheForTests()` hook is exported so
tests can assert cache behavior in isolation.

### W1 #16 — `HQ_TRANSCRIPT_TEXT_CAP` doc comment

**Files:** `packages/core/src/hq/tool-bridge.ts`

The cap is applied publisher-side (publisher.ts:411) AND at the server's
re-redaction (ws-client-events.ts:124) so both hops agree. The doc comment
now explicitly states:

- `rawContent: false` (operator-clamped) → generic 280-char summary cap.
- `rawContent: true` (default) → widen to `HQ_TRANSCRIPT_TEXT_CAP` (16 000)
  so HQ Console can render full chat-history without truncation.

### W1 #18 — Publisher backpressure surface (server-side)

**Files:** `packages/cli/src/hq-server/routes/system-handlers.ts`

The publisher's own `getQueueStats()` lives on the CLIENT side (each publisher
process owns its own offline queue). The server-side analogue is "how
recently has this client refreshed?". A stale client is the visible symptom
of a saturated publisher queue (offline backlog growing faster than drain).

**Implementation:** `handleApiSystemHealth` now also returns `publisherHealth`:
an array of per-client `{clientId, hostname, machineId, lastSeenAt, ageMs,
staleness}`. The cockpit can render this as a tile without a new endpoint.

**Future work:** a client-side `wstack hq publisher-stats` subcommand that
reads the local publisher's `getQueueStats()` for operators debugging a
specific stuck publisher.

## Deferred — RFCs

### RFC: W2 #12 — Alert snooze

**Goal:** operators can silence a firing alert rule for N minutes without
disabling it entirely.

**Design:**

- New API on `HqAlertEngine`: `snooze(ruleId: string, untilMs: number): void`.
- During evaluation, a rule whose `snoozedUntil > now` is skipped and emits
  no alert (firing or clearing). This is the load-bearing difference from
  "disable": a snooze is reversible and time-bounded.
- `unsnooze(ruleId)` clears the snooze early; the next evaluate tick re-arms.
- Snoozes are persisted to `<dataDir>/alerts-config.json` (see W2 #13).

**Risks:** a misconfigured snooze (e.g. `untilMs = Number.POSITIVE_INFINITY`)
silences a rule forever. Guard with a max snooze duration (default 24h,
operator-configurable in the same file).

**Files:** `packages/core/src/hq/alerts.ts`,
`packages/cli/src/hq-server/routes/alerts-handlers.ts` (new),
`packages/webui-hq/src/views/alerts.tsx` (snooze button + countdown badge).

### RFC: W2 #13 — Persisted alert config

**Goal:** thresholds and snoozes survive server restart.

**Design:**

- New file `<dataDir>/alerts-config.json` with shape:
  ```ts
  interface AlertsConfigFile {
    version: 1;
    updatedAt: string;
    thresholds: HqAlertRuleConfig;
    snoozes: Record<string, number>; // ruleId → untilMs (epoch)
  }
  ```
- Boot reads the file (if present) and seeds the engine.
- Engine writes back on `snooze()` / `unsnooze()` / threshold change.
- File watcher reloads on external edit; engine merges by re-evaluating.

**Risks:** concurrent writes (CLI `wstack hq alerts set` vs dashboard UI)
need `withFileLock` + `atomicWrite`. Mirror the pattern in `auth-store.ts`.

**Files:** `packages/core/src/hq/alerts-config.ts` (new),
`packages/core/src/hq/factory.ts` (wire into persistence facade).

### RFC: W2 #6 — `wstack hq alerts eval` CLI

**Goal:** dry-run alert rules against a snapshot file.

**Design:**

- New subcommand: `wstack hq alerts eval --rule <id> --snapshot <path>`.
- Loads the snapshot JSON, runs `HqAlertEngine.evaluate()`, prints which
  rules fire and at what severity.
- No server required; pure function already exists.

**Files:** `packages/cli/src/subcommands/handlers/hq.ts`,
`packages/cli/tests/hq-alerts-eval.test.ts`.

### RFC: W2 #14 — Mailbox gateway health tile

**Goal:** surface gateway-manager health in the cockpit.

**Design:**

- New method `MailboxGatewayManager.getHealth(): HqMailboxGatewayHealth`:
  `{gatewayCount, healthyCount, lastError?, lastRefreshAt}`.
- New endpoint `/api/health/mailbox` returns the health.
- New cockpit card in `packages/webui-hq/src/views/cockpit.tsx`.

**Files:** `packages/cli/src/hq-server/mailbox-gateway-manager.ts`,
`packages/cli/src/hq-server/routes/system-handlers.ts`,
`packages/webui-hq/src/views/cockpit.tsx`.

### RFC: W3 #17 — Bounded LRU for tracked agents

**Goal:** cap the working set of `TrackedAgentSnapshot` references held by
the publisher's snapshot broadcaster.

**Design:**

- New module `packages/core/src/hq/lru.ts` with `LruMap<K, V>` (O(1) get/set,
  O(1) eviction, generic key).
- Per-`(clientId, sessionId)` LRU keyed, default cap 256 entries. Eviction
  is FIFO-of-last-access; oldest untouched entry is dropped.
- **Critical invariant:** session-bridge's 4-min keep-alive must stay below
  HQ's 5-min stale-eviction window (`cli/src/hq-server/snapshot.ts`). The
  LRU must not evict an entry within that 5-min window, regardless of
  access recency — so the LRU bounds the WORKING SET, not the FRESHNESS
  FLOOR. Eviction should only apply to entries past the stale window.

**Files:** `packages/core/src/hq/lru.ts` (new),
`packages/core/src/hq/session-bridge.ts` (wire LRU).

### RFC: W3 #2 — Throughput-budget alert

**Goal:** pre-emptively alert when projected cost exceeds budget before it
actually happens.

**Design:**

- New rule in `alerts.ts`: `fleet-throughput-budget`.
- Inputs: `fleet.snapshot.totalCostUsd`, `lastSample` from
  `HqTimeseriesStore`, current minute.
- Outputs: projected USD/min; if `projectedTotalUsd > budgetUsd`, fires
  with severity `warn`.
- Threshold config: `throughputBudgetUsd`, `lookbackMinutes`.

**Files:** `packages/core/src/hq/alerts.ts`,
`packages/core/src/hq/persistence/timeseries-store.ts` (verify the
projection query surface).

### RFC: W4 #4 — Correlation IDs across envelopes

**Goal:** thread a `correlationId` through `HqEventEnvelope` so a Brain
decision on machine A that triggers a fleet spawn on machine B can be
rendered as a single causal chain in the cockpit.

**Design (phased):**

1. **Phase 1 — type ripple.** Add optional `correlationId?: string` to
   `HqEventEnvelope`. Bridges stamp it where their source carries one
   (Brain → fleet, Brain → approval). No behavioral change.
2. **Phase 2 — reducer key.** Add a `correlations` map to the WebUI-HQ
   store: `Map<correlationId, envelopeId[]>`. Render as a "Causal chain"
   panel in the cockpit.
3. **Phase 3 — generation.** Brain arbiter generates a UUID per request,
   threads it through `brain.*` and any downstream `fleet.*` /
   `approval.*` events.

**Risks:** every bridge, every reducer, every projector sees the new field.
Type ripple is bounded (optional field, default absent) but real. Ship
phase 1 in one PR; phases 2–3 separately.

**Files:** `packages/core/src/hq/protocol/core.ts`,
`packages/core/src/hq/brain-bridge.ts`, `fleet-bridge.ts`,
`approval-bridge.ts`, all `webui-protocol` projectors,
`webui-hq/src/data/store/reducers.ts`.

### RFC: W4 #7 — Command latency SLO dashboard

**Goal:** p50/p99 of `dispatched → acked` per command type over time.

**Design:**

- `HqCommandAuditLog` already records dispatched and resolved timestamps.
- Add a new timeseries bucket keyed by `commandType`, aggregating `latencyMs`.
- New endpoint `/api/trends/command-latency?bucket=5m&window=24h`.
- New view in `packages/webui-hq/src/views/trends.tsx` (extend existing).

**Files:** `packages/core/src/hq/persistence/timeseries-store.ts`,
`packages/cli/src/hq-server/routes/data-handlers.ts`,
`packages/webui-hq/src/views/trends.tsx`.

### RFC: W4 #15 — Token revoked broadcast

**Goal:** when an operator runs `wstack hq token revoke`, affected browsers
self-evict immediately instead of waiting for the next WS upgrade to fail.

**Design:**

- Auth-watcher detects removal of a `browserToken.id` and emits an
  in-process event.
- Server iterates the `browsers` map; for any browser whose cookie or URL
  token resolves to the revoked id, send an `hq.auth_revoked` frame and
  close the socket with code `4001` ("auth revoked").
- Browser-side: on `hq.auth_revoked`, scrub the cookie, mark `authRequired`,
  show a banner: "Your HQ session was revoked by an operator."

**Risks:**

- **Race:** revocation is observed AFTER the cookie is set in this browser.
  The token verifier MUST be re-checked at close time so a token revoked
  mid-session cannot be replayed (already true; `tokenHasCapability` checks
  expiry on every call).
- **Trust boundary:** the broadcast itself reveals WHICH token was revoked.
  Acceptable: the operator already knows; this just notifies affected
  browsers.

**Files:** `packages/cli/src/hq-server.ts` (auth watcher → event),
`packages/cli/src/hq-server/upgrade-handler.ts` (close + frame),
`packages/webui-hq/src/data/wire.ts` (handle `hq.auth_revoked`),
`packages/webui-hq/src/main.tsx` (mark `authRequired`).

### RFC: W5 #19 — Event Log timeline view

**Goal:** filterable timeline over the JSONL event log, separate from the
live console.

**Design:**

- Endpoint `GET /api/events?type=…&clientId=…&machineId=…&since=…&until=…&limit=…`:
  reads from `HqEventLog` with cursor-based pagination.
- New view `packages/webui-hq/src/views/events.tsx` with:
  - Filter bar (type, clientId, machineId, time range).
  - Virtualized timeline using `virtua` (already in dependencies).
  - JSON detail drawer on click.
- Reduce re-renders with `useHqStore(useShallow(...))`.

**Files:** `packages/cli/src/hq-server/routes/data-handlers.ts`
(extend `handleApiEvents`),
`packages/webui-hq/src/data/api.ts` (typed client),
`packages/webui-hq/src/views/events.tsx` (new).

### RFC: W6 #5 — HQ-mediated mailbox mutation

**Goal:** operator answers a `user_input.requested` prompt for a machine
whose WS has flapped, without waiting for the keepalive to re-establish.

**Design:**

- New capability: `control.approve_mailbox` (browser token).
- New frame: `client.mailbox_command` (server → client) carrying the
  operator's decision, analogous to the existing command plane.
- The mailbox command controller looks up the pending `userInput` resolver
  in the `ApprovalRegistry` and calls it with the operator's response.
- The existing `approval.resolved` envelope carries the result back to all
  browsers, so the dashboard reflects the operator's answer.

**Risks (high):** this is a trust-boundary change. A malicious operator
session could answer prompts they were not authorized to see. Mitigations:

- Capability-gated (`control.approve_mailbox` is NOT in the first-run token).
- Optional per-prompt approval: the operator must explicitly select the
  target prompt by `requestId` + `sessionId`.
- Audit-log every mediated answer with the operator's identity.

**Files:** `packages/core/src/hq/protocol/client.ts` (new frame type),
`packages/cli/src/hq-command-controller.ts` (new mailbox path),
`packages/cli/src/hq-server/trust-boundary.ts` (capability check),
`packages/core/src/hq/approval-bridge.ts` (resolver lookup).

### RFC: W6 #9 — TTL on `HqApprovalDecision.always`

**Goal:** `"always"` carries an optional `ttlMs`; the registry self-prunes
the granted scope when the TTL elapses.

**Design:**

- Extend `HqApprovalDecision` to `HqApprovalDecisionWithTtl`:
  `{kind: 'yes' | 'no' | 'deny'} | {kind: 'always' | 'allow-once', ttlMs?: number}`.
- `ApprovalRegistry.resolve()` records `grantedUntil = now + ttlMs ?? Infinity`.
- On `waitForConfirm`, a rule check that finds a granted entry past
  `grantedUntil` re-prompts (does not silently auto-allow).

**Risks:**

- Permission policy schema change. Existing trust policies store `"always"`
  without TTL; the migration path is to treat absent TTL as `Infinity`
  (preserving current behavior).
- Audit chain: a TTL-bounded grant is a different event than an unbounded
  one. The audit log should record `kind`, `ttlMs`, `grantedUntil`.

**Files:** `packages/core/src/types/permission-policy.ts`,
`packages/core/src/hq/protocol/tool.ts`,
`packages/core/src/hq/approval-bridge.ts`,
`packages/core/src/core/confirm-observers.ts`.

## Downgraded / Out of scope

### #3 — `hq.snapshot_diff`

**Downgraded.** The existing seq-gated `hq.snapshot` delivery is more robust
than I credited. A diff model would re-introduce state-divergence bugs the
seq model was designed to avoid (e.g. "client missed the 'remove' frame for
session X, so session X lives forever"). If we ever hit a real bandwidth
problem with snapshots, revisit with an explicit protocol version bump.

### #8 — TUI reader of `/ws/browser`

**Out of scope.** The TUI is its own workstream. The upgrade handler already
supports any WS client speaking the protocol; a TUI consumer is a separate
project.

### #10 — IndexedDB persistence of alerts/commands

**Defer.** Browser-local persistence is genuinely useful but orthogonal to
the HQ server work. Can be picked up as a follow-up if the cockpit's
in-memory caps (`MAX_ALERTS`, `MAX_COMMAND_STATUSES`) become a complaint.

### #20 — Per-connection bandwidth budget

**Needs load infra.** The right verification is a soak test with a synthetic
misbehaving publisher; we don't have that harness yet. When the load-test
infra lands, this becomes a small `token-bucket` per `(clientId, role)` in
`hq-server/ws.ts`.

## Cross-cutting invariants to respect

These were surfaced by my reads of the codebase and MUST hold across every
item above:

1. **Session-bridge keepalive < HQ stale eviction.** Session-bridge republishes
   at 80% of the 5-min stale window (4 min). Any LRU/cache in the snapshot
   path must respect this floor.

2. **Redaction is two-tier and one-way.** Publisher policy + operator policy
   via `tightenHqRedactionPolicy()`. Operator can only tighten. Secret
   scrubbing is unconditional; `rawContent` widens body visibility only.

3. **HQ is a mirror, never the sole approver.** Approval registry marks HQ
   presence as a passive observer so headless CI runs don't wait for humans
   who aren't there.

4. **Trust boundary gates every capability per connection.** From
   `@wrongstack/core/security`. New frames (`hq.auth_revoked`,
   `client.mailbox_command`) MUST route through `TrustBoundary.check()`.

5. **Browser tokens never sit in URLs.** Non-loopback origins send only the
   HttpOnly session cookie; loopback-only is gated by `isLoopbackBrowserOrigin`.
