# ProviderHealthGate — Design

**Status**: ⚠️ Design only — addresses P2 known limitation A3 from
`before-release-sprint2.md` (retry amplification under concurrent 429s).

**Owner**: TBD
**Severity**: P2 (correctness, not crash)

---

## Problem

Two independent failure-protection layers exist today and they do not
talk to each other:

| Layer | Lives in | Protects against | Shared state |
|-------|----------|------------------|--------------|
| `DefaultRetryPolicy` | `packages/core/src/execution/retry-policy.ts` | Transient provider HTTP failures (429, 5xx, network blip) | **None** — each call site retries independently |
| `CircuitBreaker` | `packages/tools/src/circuit-breaker.ts` | Bash/exec tool crashes, slow calls, burst rate | Per-`ProcessRegistry` instance; scoped to tool execution |

The provider runner (`packages/core/src/core/provider-runner.ts:42-151`)
calls `retry.shouldRetry()` → backoff → retry. The breaker is checked in
`ProcessRegistry.beforeCall()` — which is only called by `bash`/`exec`
tools, **not by the provider runner**. So provider retries never consult
the tool breaker, and the tool breaker never observes provider traffic.

### Concrete failure mode (retry amplification)

Three concurrent iterations all hit the provider's 429 rate limit
within the same second. Each iteration independently:

1. Sees `err.status === 429`
2. Asks `shouldRetry` → true (attempt 0..4)
3. Calls `delayMs(0)` → ~1s+jitter, then `delayMs(1)` → ~2s+jitter,
   ..., `delayMs(4)` → ~16s+jitter
4. Retries up to 5 times

If the 429 came from a shared per-tenant rate limit, **three iterations
each retrying 5x = 15 requests in 31s where the limit allowed 1**. The
exponential backoff with `Math.random()` jitter reduces but does not
eliminate collision probability — and the retries are not coordinated
across iterations.

### Secondary issues discovered while designing the gate

While tracing A3, two adjacent issues surfaced:

1. **`delayMs` uses real `Math.random()`** for jitter. This conflicts
   with the "no randomness in retry backoff" convention used elsewhere
   in the codebase (deterministic seed or `crypto.randomInt`). A retry
   gate that deterministically rejects the *n*-th concurrent retry is
   much easier to test. **Action**: switch jitter to a deterministic
   source (cheap fix, not blocking A3).

2. **`DefaultRetryPolicy.shouldRetry` doesn't observe `Retry-After`**.
   When a 429 response includes `Retry-After: 30`, the policy still
   uses its own exponential backoff and ignores the server's hint. This
   is "polite client" hygiene. **Action**: respect `Retry-After` if
   present and shorter than the computed backoff.

Both are mentioned here so the design doc has a single place to look,
but neither blocks the gate design.

---

## Goal

Add a **shared provider-health gate** that:

1. Observes provider outcomes across all concurrent iterations
2. Coordinates retries so that N concurrent iterations hitting 429 do
   not retry in lockstep
3. Integrates cleanly with the existing `RetryPolicy` and
   `CircuitBreaker` without breaking their contracts
4. Adds observability so the user can see "provider degraded, retry
   gated" via `/diag` and structured logs

**Non-goals**:

- Not a per-iteration breaker (the existing `CircuitBreaker` already
  protects tools; this is for the *provider*).
- Not a replacement for `RetryPolicy`. `RetryPolicy` decides *whether*
  to retry this specific attempt; the gate decides *when* it is safe
  to retry at all.
- Not global rate limiting. Providers already enforce their own per-tenant
  limits; the gate is a coordination layer on our side.

---

## Proposed design: `ProviderHealthGate`

### Shape

```ts
// packages/core/src/execution/provider-health-gate.ts

export interface ProviderHealthGate {
  /**
   * Called BEFORE a retry attempt is dispatched. Returns a delay
   * (ms) that the caller should wait before retrying. May return 0
   * if no coordination is needed. May return a delay > computed
   * backoff if the gate is in a "degraded" state.
   */
  acquireRetrySlot(providerId: string, attempt: number): Promise<number>;

  /**
   * Called AFTER every provider call (success or failure). Records the
   * outcome for future gating decisions.
   */
  recordOutcome(providerId: string, outcome: ProviderOutcome): void;

  /** Snapshot for /diag observability. */
  snapshot(): ProviderHealthSnapshot;
}

interface ProviderOutcome {
  status?: number;       // HTTP status, undefined for network errors
  retryAfterMs?: number; // parsed from Retry-After header if present
  durationMs: number;
}
```

### Algorithm

A **token bucket per provider** with these properties:

- **Bucket size**: `burstCapacity` (default 5) — allows short bursts
- **Refill rate**: `refillPerSecond` (default 1.0) — sustained retry rate
- **State per provider**: `{ tokens: number, lastRefillAt: number,
  consecutiveFailures: number, lastFailureAt: number | null }`

On `acquireRetrySlot(providerId, attempt)`:

1. Refill tokens based on elapsed time (`min(burst, tokens + elapsed * refill)`)
2. If `tokens >= 1`: consume 1, return `0` (no gating needed)
3. Else: compute `waitMs = (1 - tokens) / refillPerSecond * 1000`,
   return `waitMs`. Caller awaits this before retrying.

On `recordOutcome(providerId, outcome)`:

1. If `outcome.status === 429 || outcome.status >= 500`:
   - Halve `burstCapacity` for this provider (down to a floor of 1)
   - Increment `consecutiveFailures`
2. If `outcome.status` undefined or 2xx:
   - Increment `tokens` (capped at original burst capacity)
   - Reset `consecutiveFailures`

### Why token bucket (and not sliding-window or leaky bucket)

- **Bounded memory**: one struct per provider, no per-call records
- **Allows bursts**: a single iteration that hits a 429 once shouldn't
  block other iterations forever
- **Self-healing**: the bucket refills over time, so a transient
  provider hiccup doesn't permanently degrade retry behavior
- **Easy to reason about**: `tokens` and `refill` are intuitive

### Integration with `DefaultRetryPolicy`

The gate is **not** wired into `shouldRetry`. It's wired into the
**delay computation** path:

```ts
// packages/core/src/core/provider-runner.ts (sketch)

const policyDelay = retryPolicy.delayMs(attempt);
const gateDelay = await healthGate.acquireRetrySlot(providerId, attempt);
const finalDelay = Math.max(policyDelay, gateDelay);
await sleep(finalDelay, abortSignal);
```

This preserves the existing `RetryPolicy.delayMs` contract — the policy
still decides its backoff shape — but the gate adds a floor when
multiple iterations are competing for the same provider.

### State sharing

The gate is a **singleton per `ProviderRegistry`** (one instance per
project, shared across sessions, but **not** persisted across restarts —
in-memory only). A fresh process starts with full buckets; the gate
learns from runtime traffic.

If multiple projects hit the same provider concurrently, they share the
same bucket — which is the desired behavior (the provider sees one
combined retry stream, not two).

### Interaction with `CircuitBreaker`

`CircuitBreaker` and `ProviderHealthGate` are orthogonal and intentionally
do not coordinate:

- `CircuitBreaker` → bash/exec tool outcomes (subprocess crashes,
  hangs, bursts)
- `ProviderHealthGate` → provider HTTP outcomes (429, 5xx, network)

A bash command that spawns 100 grep processes trips the breaker
without touching the provider at all. A provider 429 doesn't trip the
breaker (the bash tool succeeded; the *call* failed). Keeping them
separate is correct.

---

## Phased rollout

### Phase 1 — Gate scaffolding (no behavior change)

1. New file `packages/core/src/execution/provider-health-gate.ts`
   implementing the interface above
2. Unit tests for token-bucket math (refill, consumption, decay)
3. `ProviderRegistry.getHealthGate()` accessor, defaulting to a
   no-op gate
4. **No** change to `provider-runner.ts` yet

### Phase 2 — Wire the gate

1. `provider-runner.ts` calls `gate.acquireRetrySlot` and
   `gate.recordOutcome` on every retry attempt
2. Gate is initially permissive (high `burstCapacity`, fast `refill`)
   so behavior is observably equivalent to today
3. `/diag` adds a "Provider health" section with the snapshot

### Phase 3 — Tune defaults

1. After a week of telemetry, decide if defaults need adjustment
2. Default to `burstCapacity=5, refillPerSecond=1.0` — generous enough
   that a single iteration hitting 429 once doesn't gate anything,
   but three concurrent iterations hitting 429 simultaneously will
   spread their retries

### Phase 4 — Document and stabilize

1. Update `docs/configuration.md` with the gate's knobs
2. Add `ProviderHealthGate` to the "retry semantics" section of the
   provider docs

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Gate adds latency to every retry | High (intentional) | Gate returns 0 when tokens are available; only delays when bucket is empty |
| Gate state grows unbounded per provider | Low | One struct per provider, no per-call records |
| Gate is bypassed by direct `RetryPolicy` callers | Medium | Audit all `shouldRetry`/`delayMs` callers; the gate is opt-in via `provider-runner` only |
| Gate makes testing harder | Medium | Inject a fake clock into the gate; deterministic refill |
| Provider changes 429 semantics | Low | Treat any 5xx as a signal; we don't try to parse provider-specific headers beyond `Retry-After` |
| User wants to disable the gate | Low | `ProviderRegistry.setHealthGate(noOpGate)` — no-op gate always returns 0 |

---

## Alternatives considered

### A. Share state via the existing `CircuitBreaker`

Rejected. The breaker is tool-scoped; adding a second role (provider
health) to the same class would tangle two unrelated failure modes.
Bash crashes and provider 429s should not share a counter — a hung
subprocess shouldn't suppress retries for unrelated network errors.

### B. Per-iteration retry budget instead of a shared bucket

Considered. A simple "max retries per minute" per iteration is easier
to implement but doesn't solve the amplification problem — each
iteration still has its own budget that they consume in parallel.

### C. Honor `Retry-After` and skip the gate entirely

Considered as a *complement*, not a replacement. `Retry-After` is a
provider hint about *this specific request*; the gate is a coordination
signal about *aggregate load*. Both are useful.

### D. Use the existing `RateLimiter` from `packages/core/src/utils/`

Investigated. The current `RateLimiter` is a fixed-window
requests-per-second limiter, which doesn't model token-bucket
backpressure correctly. Either extend it or add a new class — adding a
new class is cleaner because the semantics are different (gate ≠ rate
limit).

---

## Files affected (when implemented)

- **New**: `packages/core/src/execution/provider-health-gate.ts`
- **New**: `packages/core/tests/execution/provider-health-gate.test.ts`
- **Modify**: `packages/core/src/core/provider-runner.ts` (Phase 2)
- **Modify**: `packages/core/src/registry/provider-registry.ts` (Phase 1)
- **Modify**: `docs/configuration.md` (Phase 4)
- **Touch**: `/diag` view (add Provider Health section)

---

## Definition of done

- [ ] Gate implemented with deterministic token bucket
- [ ] Wire integrated into `provider-runner.ts`
- [ ] No behavior change for single-iteration scenarios
- [ ] Concurrent 429 scenario shows spread retries (test fixture)
- [ ] `/diag` exposes gate snapshot
- [ ] Documentation updated
- [ ] `before-release-sprint2.md` A3 status flipped to ✅ Done