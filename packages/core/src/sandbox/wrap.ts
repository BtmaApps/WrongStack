import type { Tool } from '../types/tool.js';
import {
  emitSandboxDenied,
  getSandboxExpansionApprover,
  recordSandboxSessionEvent,
  requestSandboxExpansion,
  type SandboxExpansionCtx,
} from './audit.js';
import { policyOnlySandboxBackend } from './backends/policy-only.js';
import { getResolvedSandboxConfig } from './manager.js';
import { type SandboxBackend, SandboxDeniedError, type SandboxDenyDecision } from './types.js';

/**
 * Exec-family choke point (T2). Wraps a tool so its `execute` re-reads the
 * sandbox policy on EVERY call (config may be enabled or disabled at runtime):
 *  - mode `off` (the default): delegates unchanged — no behavioral delta;
 *  - mode `enforced`: consults the backend first. The T2 `policy-only`
 *    backend never denies, so enforced runs are also pass-through; denying
 *    backends (T4/T5) throw `SandboxDeniedError` from this seam.
 *
 * `executeStream` is intentionally passed through in T2: the policy-only
 * backend cannot deny, so streaming behavior is identical. Denying backends
 * must extend this wrapper to interpose on streams before shipping.
 */
export function createSandboxExecWrapper(
  options: { backend?: SandboxBackend } = {},
): <I, O>(tool: Tool<I, O>) => Tool<I, O> {
  const backend: SandboxBackend = options.backend ?? policyOnlySandboxBackend;
  return <I, O>(tool: Tool<I, O>): Tool<I, O> => {
    const rawExecute = tool.execute;
    if (!rawExecute) return tool;
    const wrapped: Tool<I, O> = {
      ...tool,
      execute: async (input, ctx, opts) => {
        const cfg = getResolvedSandboxConfig();
        if (cfg.mode !== 'enforced') {
          return rawExecute.call(tool, input, ctx, opts);
        }
        const decision = (await backend.enforceExec({ tool: tool.name })) as
          | { outcome: 'allow' }
          | SandboxDenyDecision;
        if (decision.outcome === 'deny') {
          emitSandboxDenied(tool.name, decision, cfg.tier);
          const sessionCtx: SandboxExpansionCtx = {
            session: (ctx as { session?: SandboxExpansionCtx['session'] } | undefined)?.session,
          };
          void recordSandboxSessionEvent(sessionCtx, {
            kind: 'sandbox.denied',
            tool: tool.name,
            at: new Date().toISOString(),
            detail: { tier: cfg.tier, reason: decision.reason, missing: [...decision.missing] },
          });
          // T6: an expansion exists only when a host registered an approver —
          // otherwise a denial stays a denial (no request/outcome chatter).
          if (getSandboxExpansionApprover()) {
            const resolution = await requestSandboxExpansion(
              { tool: tool.name },
              decision,
              'agent',
              sessionCtx,
            );
            if (resolution.granted) {
              // One-call elevation (T6): the approval covers THIS call only.
              return rawExecute.call(tool, input, ctx, opts);
            }
          }
          throw new SandboxDeniedError(tool.name, decision);
        }
        return rawExecute.call(tool, input, ctx, opts);
      },
    };
    return wrapped;
  };
}
