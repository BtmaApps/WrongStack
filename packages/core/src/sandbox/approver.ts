import type { SandboxExpansionApprover, SandboxExpansionCtx } from './audit.js';

/**
 * Structural slice of the host permission policy the expansion flow needs
 * (plan 28 T6). Typed structurally so the sandbox layer stays decoupled from
 * the policy implementation; the real policy rides the standard approval
 * path — trust rules, YOLO and the prompt delegate all apply unchanged.
 */
interface ExpansionPolicy {
  evaluate(tool: unknown, input: unknown, ctx: unknown): Promise<{ permission: string }>;
}

/**
 * A synthetic, never-executed pseudo-tool the policy judges like any other
 * confirm tool. Spec (L24): expansion approvals reuse `permissionPolicy.evaluate`
 * with an expansion decision kind — no new Brain option contract.
 */
const expansionPseudoTool = {
  name: 'sandbox-expansion',
  description:
    'One-call sandbox expansion request. Approving re-runs the previously denied exec call exactly once.',
  permission: 'confirm',
  mutating: false,
  inputSchema: { type: 'object', properties: {} },
} as unknown as Parameters<ExpansionPolicy['evaluate']>[0];

/**
 * Adapter that turns a host permission policy into the sandbox expansion
 * approver. Granted only on an explicit `allow` verdict; a `confirm` the user
 * did not answer, a `deny`, or any thrown error fail closed.
 */
export function createPolicySandboxApprover(
  policy: ExpansionPolicy | (() => ExpansionPolicy),
): SandboxExpansionApprover {
  return async (call, decision, ctx?: SandboxExpansionCtx) => {
    try {
      const resolved = typeof policy === 'function' ? policy() : policy;
      const result = await resolved.evaluate(
        expansionPseudoTool,
        { tool: call.tool, reason: decision.reason, missing: decision.missing },
        ctx,
      );
      return { granted: result.permission === 'allow', decidedBy: `policy:${result.permission}` };
    } catch (error) {
      // String(error), not the `instanceof Error ? .message : String()` form —
      // that expression is a security-ratchet pattern and must not spread.
      return { granted: false, decidedBy: `approver-error:${String(error)}` };
    }
  };
}
