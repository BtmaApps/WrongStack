/**
 * Circuit breaker for the Brain's LLM pool.
 *
 * The single-LLM tier walks its whole pool on every decision, giving each
 * target the full `decisionTimeoutMs`. When the pool is dead — expired key,
 * provider outage, offline machine — that costs `pool.length × timeout` PER
 * DECISION, forever, with no memory between calls. With a `fallbackModels`
 * chain of five and the default 15s timeout, a single Brain question stalls
 * the caller for over a minute, repeatedly, to reach a conclusion the
 * previous decision already reached.
 *
 * This breaker gives the pool a memory:
 *
 *   - CLOSED    — normal operation; every failure increments a counter.
 *   - OPEN      — after `failureThreshold` consecutive failures the tier is
 *                 skipped outright for `cooldownMs`, so decisions fall
 *                 straight through to the deterministic tiers instead of
 *                 paying the timeout again.
 *   - HALF_OPEN — once the cooldown expires, ONE probe decision is allowed
 *                 through. Success closes the breaker; failure re-opens it
 *                 for another cooldown.
 *
 * Per-target health is tracked separately so `orderTargets()` can move a
 * known-bad model to the back of the pool without removing it — a model that
 * recovers is still tried, just last.
 *
 * @module brain-circuit
 */

export type BrainCircuitState = 'closed' | 'open' | 'half_open';

export interface BrainCircuitOptions {
  /** Consecutive failures before the breaker opens. Default 3. 0 disables. */
  failureThreshold?: number | undefined;
  /** How long the breaker stays open before allowing a probe (ms). Default 60_000. */
  cooldownMs?: number | undefined;
  /** Override the clock for deterministic tests. */
  now?: (() => number) | undefined;
}

export interface BrainCircuitSnapshot {
  state: BrainCircuitState;
  consecutiveFailures: number;
  /** When the breaker last opened, or undefined while closed. */
  openedAt: number | undefined;
  /** Per-target consecutive failure counts, worst first. */
  unhealthyTargets: Array<{ label: string; failures: number }>;
}

/**
 * Failure memory for the Brain LLM tier. Pure bookkeeping — it performs no
 * I/O and makes no decisions of its own; callers ask `shouldAttempt()` before
 * spending a timeout and report back via `recordSuccess` / `recordFailure`.
 */
export class BrainCircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt: number | undefined;
  /** Set while a half-open probe is in flight, so only one is allowed. */
  private probeInFlight = false;
  private readonly targetFailures = new Map<string, number>();

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(opts: BrainCircuitOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  /** Disabled breakers never open, so callers can skip the state dance. */
  get enabled(): boolean {
    return this.failureThreshold > 0;
  }

  state(): BrainCircuitState {
    if (!this.enabled || this.openedAt === undefined) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }

  /**
   * May the LLM tier be consulted right now?
   *
   * Returns false only while the breaker is fully open, or when a half-open
   * probe is already in flight — concurrent decisions must not all become
   * probes, or an outage would still cost the full timeout on every one.
   */
  shouldAttempt(): boolean {
    if (!this.canAttempt()) return false;
    if (!this.enabled) return true;
    const state = this.state();
    if (state === 'closed') return true;
    this.probeInFlight = true;
    return true;
  }

  /** Inspect eligibility without claiming the half-open probe. */
  canAttempt(): boolean {
    return (
      !this.enabled ||
      this.state() === 'closed' ||
      (this.state() === 'half_open' && !this.probeInFlight)
    );
  }

  recordSuccess(targetLabel?: string): void {
    this.consecutiveFailures = 0;
    this.openedAt = undefined;
    this.probeInFlight = false;
    if (targetLabel) this.targetFailures.delete(targetLabel);
  }

  recordFailure(targetLabel?: string): void {
    if (targetLabel) {
      this.targetFailures.set(targetLabel, (this.targetFailures.get(targetLabel) ?? 0) + 1);
    }
    if (!this.enabled) return;
    this.consecutiveFailures += 1;
    this.probeInFlight = false;
    if (this.consecutiveFailures >= this.failureThreshold) {
      // Re-stamp on every failure past the threshold: a half-open probe that
      // fails must buy a FRESH cooldown, not resume the expired one.
      this.openedAt = this.now();
    }
  }

  /**
   * Reorder a pool so targets with recent failures are tried last, preserving
   * relative order within each group. A bad model is deprioritised, never
   * dropped — it stays reachable the moment it recovers.
   */
  orderTargets<T>(targets: readonly T[], labelOf: (target: T) => string): T[] {
    if (this.targetFailures.size === 0) return [...targets];
    return [...targets].sort(
      (a, b) =>
        (this.targetFailures.get(labelOf(a)) ?? 0) - (this.targetFailures.get(labelOf(b)) ?? 0),
    );
  }

  snapshot(): BrainCircuitSnapshot {
    return {
      state: this.state(),
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      unhealthyTargets: [...this.targetFailures.entries()]
        .map(([label, failures]) => ({ label, failures }))
        .sort((a, b) => b.failures - a.failures),
    };
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.openedAt = undefined;
    this.probeInFlight = false;
    this.targetFailures.clear();
  }
}
