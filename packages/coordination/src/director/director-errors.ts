/**
 * Director-specific error types. Extracted to keep the Director class
 * focused on orchestration logic.
 */

export class FleetSpawnBudgetError extends Error {
  readonly kind: 'max_spawns' | 'max_spawn_depth';
  readonly limit: number;
  readonly observed: number;
  constructor(
    kind: 'max_spawns' | 'max_spawn_depth',
    limit: number,
    observed: number,
    message?: string | undefined,
  ) {
    const defaultMsg =
      kind === 'max_spawns'
        ? `Director spawn budget exceeded: tried to spawn #${observed} but maxSpawns is ${limit}`
        : `Director spawn depth budget exceeded: this director is at depth ${observed} and maxSpawnDepth is ${limit}`;
    super(message ?? defaultMsg);
    this.name = 'FleetSpawnBudgetError';
    this.kind = kind;
    this.limit = limit;
    this.observed = observed;
  }
}

export class FleetCostCapError extends Error {
  readonly kind: 'max_cost_usd';
  readonly limit: number;
  readonly observed: number;
  constructor(limit: number, observed: number) {
    super(
      `Director cost cap exceeded: total fleet spend ${observed.toFixed(4)} exceeds maxCostUsd ${limit.toFixed(4)}`,
    );
    this.name = 'FleetCostCapError';
    this.kind = 'max_cost_usd';
    this.limit = limit;
    this.observed = observed;
  }
}

export class FleetTokenCapError extends Error {
  readonly kind: 'max_tokens';
  readonly limit: number;
  readonly observed: number;
  constructor(limit: number, observed: number) {
    super(
      `Director token cap exceeded: total fleet usage ${Math.round(observed)} tokens meets or exceeds maxTokens ${Math.round(limit)}`,
    );
    this.name = 'FleetTokenCapError';
    this.kind = 'max_tokens';
    this.limit = limit;
    this.observed = observed;
  }
}

export class FleetContextOverflowError extends Error {
  readonly kind: 'max_context_load';
  readonly limit: number;
  readonly observed: number;
  constructor(limit: number, observed: number) {
    super(
      `Leader context overflow: leader has ${observed} tokens in flight (limit: ${limit}). Compact the leader context before spawning more subagents.`,
    );
    this.name = 'FleetContextOverflowError';
    this.kind = 'max_context_load';
    this.limit = limit;
    this.observed = observed;
  }
}
