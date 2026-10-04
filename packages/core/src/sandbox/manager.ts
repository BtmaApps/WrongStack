import { resolveSandboxConfig, type SandboxConfig } from './types.js';

let policySource: (() => Partial<SandboxConfig> | undefined) | undefined;

function normalizeSource(
  source: Partial<SandboxConfig> | (() => Partial<SandboxConfig> | undefined) | undefined,
): (() => Partial<SandboxConfig> | undefined) | undefined {
  if (typeof source === 'function') return source;
  if (source === undefined) return undefined;
  return () => source;
}

/**
 * Host-side injection point, mirroring exec.ts's `configureExecPolicy` /
 * `resetExecPolicy` pattern. Accepts a static config object or a lazy source
 * function. Call with `undefined` (or `resetSandboxPolicy()`) to return to
 * the no-config default (`mode: 'off'`).
 */
export function configureSandboxPolicy(
  source: Partial<SandboxConfig> | (() => Partial<SandboxConfig> | undefined) | undefined,
): void {
  policySource = normalizeSource(source);
}

export function resetSandboxPolicy(): void {
  policySource = undefined;
}

/** Resolved policy snapshot the choke point reads at call time. */
export function getResolvedSandboxConfig(): SandboxConfig {
  return resolveSandboxConfig(policySource?.());
}
