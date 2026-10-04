import type { Tool } from '../types/tool.js';
import { resolveSandboxConfigForAgent } from './agent-overrides.js';
import {
  emitSandboxDenied,
  getSandboxExpansionApprover,
  recordSandboxSessionEvent,
  requestSandboxExpansion,
  type SandboxExpansionCtx,
} from './audit.js';
import { containerSandboxBackend } from './backends/container.js';
import { policyOnlySandboxBackend } from './backends/policy-only.js';
import { windowsNativeSandboxBackend } from './backends/windows-native.js';
import {
  type SandboxBackend,
  type SandboxConfig,
  SandboxDeniedError,
  type SandboxDenyDecision,
  type SandboxRoute,
  type SandboxRouteRequest,
} from './types.js';

/**
 * Exec-family choke point (T2). Wraps a tool so its `execute` AND
 * `executeStream` re-read the sandbox policy on EVERY call (config may be
 * enabled or disabled at runtime):
 *  - mode `off` (the default): delegates unchanged — no behavioral delta;
 *  - mode `enforced`: consults the backend first. The T2 `policy-only`
 *    backend never denies, so enforced runs are also pass-through; denying
 *    backends (T4/T5) hit the expansion flow and either elevate the single
 *    call (T6) or throw `SandboxDeniedError` from this seam.
 *
 * Both seams enforce: a denying backend cannot be bypassed by calling the
 * streaming entry point (T4/T5 prerequisite).
 */
async function resolveDeny(
  toolName: string,
  decision: SandboxDenyDecision,
  tier: string,
  ctx: unknown,
): Promise<'denied' | 'elevated'> {
  emitSandboxDenied(toolName, decision, tier);
  const sessionCtx: SandboxExpansionCtx = {
    session: (ctx as { session?: SandboxExpansionCtx['session'] } | undefined)?.session,
  };
  void recordSandboxSessionEvent(sessionCtx, {
    kind: 'sandbox.denied',
    tool: toolName,
    at: new Date().toISOString(),
    detail: { tier, reason: decision.reason, missing: [...decision.missing] },
  });
  // T6: an expansion exists only when a host registered an approver —
  // otherwise a denial stays a denial (no request/outcome chatter).
  if (!getSandboxExpansionApprover()) return 'denied';
  const resolution = await requestSandboxExpansion(
    { tool: toolName },
    decision,
    'agent',
    sessionCtx,
  );
  // One-call elevation (T6): the approval covers THIS call only.
  return resolution.granted ? 'elevated' : 'denied';
}

export function createSandboxExecWrapper(
  options: { backend?: SandboxBackend } = {},
): <I, O>(tool: Tool<I, O>) => Tool<I, O> {
  // Explicit backend (tests) wins; otherwise the resolved config selects
  // per call, so runtime toggles between policy-only and container work.
  const selectedBackend: SandboxBackend | undefined = options.backend;

  function backendFor(id: SandboxConfig['backend']): SandboxBackend {
    if (id === 'container') return containerSandboxBackend;
    if (id === 'windows-native') return windowsNativeSandboxBackend;
    return policyOnlySandboxBackend;
  }

  /** bash routes as a shell line (BashInput carries only `command` — argv never); exec routes as argv; anything else (git/pwsh) is unroutable per the T4.1 contract. */
  function toRouteRequest(
    name: string,
    input: unknown,
    ctx: unknown,
  ): SandboxRouteRequest | undefined {
    const cwd = (ctx as { cwd?: string } | undefined)?.cwd;
    const source = input as { command?: unknown; args?: unknown } | undefined;
    if (!source || typeof source.command !== 'string') return undefined;
    if (name === 'bash') {
      return { tool: name, kind: 'shell', command: source.command, cwd };
    }
    if (name === 'exec') {
      const args = Array.isArray(source.args) ? source.args.map((arg) => String(arg)) : [];
      return {
        tool: name,
        kind: 'argv',
        command: source.command,
        argv: [source.command, ...args],
        cwd,
      };
    }
    return undefined;
  }

  function applyRoute(
    name: string,
    input: Record<string, unknown>,
    routed: SandboxRoute,
  ): Record<string, unknown> {
    if (name === 'bash') {
      return routed.command === undefined ? input : { ...input, command: routed.command };
    }
    if (routed.argv === undefined) return input;
    const [head = '', ...rest] = routed.argv;
    return { ...input, command: head, args: rest };
  }

  return <I, O>(tool: Tool<I, O>): Tool<I, O> => {
    const rawExecute = tool.execute;
    if (!rawExecute) return tool;
    const wrapped: Tool<I, O> = {
      ...tool,
      execute: async (input, ctx, opts) => {
        const cfg = resolveSandboxConfigForAgent(
          (ctx as { agentId?: string } | undefined)?.agentId,
        );
        const backend = selectedBackend ?? backendFor(cfg.backend);
        if (cfg.mode !== 'enforced') {
          return rawExecute.call(tool, input, ctx, opts);
        }
        const decision = (await backend.enforceExec({ tool: tool.name, config: cfg })) as
          | { outcome: 'allow' }
          | SandboxDenyDecision;
        if (decision.outcome === 'deny') {
          // Granted one-call elevation (T6) runs THIS call unsandboxed —
          // routing is skipped so an approved call can't be rewritten into a
          // form the deny reason made impossible (chimera medium, 2026-10-04).
          if ((await resolveDeny(tool.name, decision, cfg.tier, ctx)) === 'denied') {
            throw new SandboxDeniedError(tool.name, decision);
          }
          return rawExecute.call(tool, input, ctx, opts);
        }
        if (typeof backend.routeExec === 'function') {
          const routeRequest = toRouteRequest(tool.name, input, ctx);
          if (routeRequest) {
            let routed = backend.routeExec(routeRequest, cfg);
            if (routed && typeof backend.applyHelper === 'function') {
              routed = (await backend.applyHelper(routed)) ?? routed;
            }
            if (routed) {
              input = applyRoute(tool.name, input as Record<string, unknown>, routed) as I;
            }
          }
        }
        return rawExecute.call(tool, input, ctx, opts);
      },
    };
    const rawExecuteStream = tool.executeStream;
    if (rawExecuteStream) {
      wrapped.executeStream = async function* (input: I, ctx: unknown, opts: unknown) {
        const cfg = resolveSandboxConfigForAgent(
          (ctx as { agentId?: string } | undefined)?.agentId,
        );
        const backend = selectedBackend ?? backendFor(cfg.backend);
        if (cfg.mode !== 'enforced') {
          yield* rawExecuteStream.call(tool, input, ctx as never, opts as never);
          return;
        }
        const decision = (await backend.enforceExec({ tool: tool.name, config: cfg })) as
          | { outcome: 'allow' }
          | SandboxDenyDecision;
        if (decision.outcome === 'deny') {
          // Granted one-call elevation (T6) runs THIS call unsandboxed —
          // routing is skipped so an approved call can't be rewritten into a
          // form the deny reason made impossible (chimera medium, 2026-10-04).
          if ((await resolveDeny(tool.name, decision, cfg.tier, ctx)) === 'denied') {
            throw new SandboxDeniedError(tool.name, decision);
          }
          yield* rawExecuteStream.call(tool, input, ctx as never, opts as never);
          return;
        }
        if (typeof backend.routeExec === 'function') {
          const routeRequest = toRouteRequest(tool.name, input, ctx);
          if (routeRequest) {
            let routed = backend.routeExec(routeRequest, cfg);
            if (routed && typeof backend.applyHelper === 'function') {
              routed = (await backend.applyHelper(routed)) ?? routed;
            }
            if (routed) {
              input = applyRoute(tool.name, input as Record<string, unknown>, routed) as I;
            }
          }
        }
        yield* rawExecuteStream.call(tool, input, ctx as never, opts as never);
      } as typeof rawExecuteStream;
    }
    return wrapped;
  };
}
