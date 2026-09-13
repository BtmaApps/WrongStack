/**
 * W2 #14 (RFC hq-improvements-2026-09.md): Mailbox gateway health types.
 *
 * These types are the wire contract for `/api/health/mailbox`. They live in
 * their own module so both the gateway manager (producer) and the HTTP
 * handler (consumer) can import them without a circular dependency.
 *
 * Critical contract (from SAGE memory, surfaced multiple times in this work):
 *
 *   - Mailbox credential `projectId` is the **basename** of the project
 *     directory, not the full path. `mailbox-serve.ts:192` derives it via
 *     `path.basename(projectDir)`. The dashboard MUST render `projectId`
 *     from this surface so it matches what other mailbox surfaces see.
 *
 *   - HQ's `MailboxGatewayManager` binds gateways with the **full filesystem
 *     path** (from `resolveHqProjectRoot(...)` in `mailbox-handlers.ts:90`).
 *     We surface the full path as `projectRoot` so operators can debug
 *     path-mismatch issues without grepping the source.
 *
 *   - HQ never attaches a `MailboxActorContext` to its mailbox authorization
 *     decisions (see `authorizeMailboxGateway` in `mailbox-gateway-manager.ts:57-96`).
 *     The aggregate `actorAttached: false` flag surfaces this truth so the
 *     dashboard can render "no actor context" honestly.
 *
 * @module hq-server/mailbox-gateway-health
 */

/**
 * One mailbox gateway entry — one per bound `projectDir` in the manager.
 */
export interface HqMailboxGatewayHealthEntry {
  /**
   * Credential contract key: `path.basename(projectRoot)`. Matches the
   * `projectId` used by `mailbox-serve.ts` and other mailbox surfaces.
   */
  projectId: string;
  /** Full filesystem path the gateway is bound to. */
  projectRoot: string;
  /** Whether the gateway has any open HTTP streams right now. */
  hasActiveStreams: boolean;
  /** Epoch ms of the last `getMailboxGateway` / `authorizeMailboxGateway` hit, or null if never used. */
  lastUsedAt: number | null;
  /** Convenience: `Date.now() - lastUsedAt`, or null when `lastUsedAt` is null. */
  idleForMs: number | null;
}

/**
 * Aggregate health snapshot for the HQ cockpit "Mailbox gateway" card.
 */
export interface HqMailboxGatewayHealth {
  /** Total number of bound gateways. */
  gatewayCount: number;
  /** Whether the rate limiter is configured. Always `true` on the HQ mount. */
  rateLimiterConfigured: boolean;
  /**
   * Whether the gateway manager attaches a `MailboxActorContext` to its
   * authorization decisions. HQ is a read-mostly operator dashboard and
   * never attaches one — this flag is `false` on the HQ mount and is
   * surfaced so the dashboard can render the truthful state.
   */
  actorAttached: boolean;
  /** Per-gateway health entries, sorted by `projectId` for stable rendering. */
  gateways: readonly HqMailboxGatewayHealthEntry[];
  /** Idle-eviction sweep interval in ms (mirrors the manager's private constant). */
  sweepIntervalMs: number;
  /** Idle TTL after which a gateway is eligible for eviction. */
  idleTtlMs: number;
}
