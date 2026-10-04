/**
 * Sandbox tier contract (plan 28 — docs/specs/sandboxed-execution-tiers-sdd.md).
 *
 * T1 scope: types + config resolution only. Enforcement lives in the exec
 * choke point (`wrap.ts`) and the backend implementations. The default config
 * (`mode: 'off'`) preserves current behavior exactly — hosts opt in.
 */

/** Sandbox enforcement mode. `off` (the default) preserves current behavior exactly. */
export type SandboxMode = 'off' | 'enforced';

/** Containment level. T2 ships the contract; `container` / `windows-native` backends (T4/T5) enforce it. */
export type SandboxTier = 'read-only' | 'workspace-write' | 'full-access';

/** Backend selection. Only `policy-only` is implemented in T2 (never denies). */
export type SandboxBackendId = 'policy-only' | 'container' | 'windows-native';

export const SANDBOX_MODES: readonly SandboxMode[] = ['off', 'enforced'];
export const SANDBOX_TIERS: readonly SandboxTier[] = [
  'read-only',
  'workspace-write',
  'full-access',
];
export const SANDBOX_BACKEND_IDS: readonly SandboxBackendId[] = [
  'policy-only',
  'container',
  'windows-native',
];

export interface SandboxConfig {
  mode: SandboxMode;
  tier: SandboxTier;
  /** Additional paths (absolute or project-relative) writable in `workspace-write` tier. */
  writableRoots: string[];
  backend: SandboxBackendId;
}

/** Frozen defaults: `mode: 'off'` means no behavioral change for any host. */
export const DEFAULT_SANDBOX_CONFIG: Readonly<SandboxConfig> = Object.freeze({
  mode: 'off',
  tier: 'read-only',
  writableRoots: [] as string[],
  backend: 'policy-only',
});

/** One exec-family call as seen by the choke point. */
export interface SandboxExecCall {
  readonly tool: string;
}

export type SandboxDecision =
  | { readonly outcome: 'allow' }
  | {
      readonly outcome: 'deny';
      readonly reason: string;
      readonly missing: ReadonlyArray<{
        readonly type: 'path' | 'network';
        readonly value: string;
      }>;
    };

export interface SandboxBackend {
  readonly id: SandboxBackendId;
  enforceExec(call: SandboxExecCall): Promise<SandboxDecision>;
}

/** The deny arm of SandboxDecision — what denials, audit events, and expansion requests carry. */
export type SandboxDenyDecision = Extract<SandboxDecision, { outcome: 'deny' }>;

/** Thrown by the choke point when a backend denies an exec-family call. */
export class SandboxDeniedError extends Error {
  readonly kind = 'sandbox_denied';
  readonly tool: string;
  readonly decision: Extract<SandboxDecision, { outcome: 'deny' }>;

  constructor(tool: string, decision: Extract<SandboxDecision, { outcome: 'deny' }>) {
    super(`sandbox_denied: ${tool}: ${decision.reason}`);
    this.name = 'SandboxDeniedError';
    this.tool = tool;
    this.decision = decision;
  }
}

function pick<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  field: string,
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if (!allowed.includes(value)) {
    throw new TypeError(
      `tools.sandbox.${field} must be one of ${allowed.join(', ')} (got ${String(value)})`,
    );
  }
  return value;
}

/** Merge a partial config over the defaults, validating every enum field. */
export function resolveSandboxConfig(raw?: Partial<SandboxConfig> | undefined): SandboxConfig {
  const roots = raw?.writableRoots ?? DEFAULT_SANDBOX_CONFIG.writableRoots;
  if (!Array.isArray(roots) || roots.some((r) => typeof r !== 'string')) {
    throw new TypeError('tools.sandbox.writableRoots must be an array of strings');
  }
  return {
    mode: pick(raw?.mode, SANDBOX_MODES, 'mode', DEFAULT_SANDBOX_CONFIG.mode),
    tier: pick(raw?.tier, SANDBOX_TIERS, 'tier', DEFAULT_SANDBOX_CONFIG.tier),
    writableRoots: [...roots],
    backend: pick(raw?.backend, SANDBOX_BACKEND_IDS, 'backend', DEFAULT_SANDBOX_CONFIG.backend),
  };
}
