/**
 * WrongStack's permission rules for an external ACP worker.
 *
 * A delegated agent must not be a one-hop bypass of the user's approval
 * system. WrongStack's own subagents run every tool call through
 * `AutoApprovePermissionPolicy`: the user's deny rules bind them, destructive
 * commands and credential reads are refused (a worker cannot ask), and the
 * user's YOLO+ lifts those refusals. An ACP worker gets the same treatment:
 * the host starts it in a mode where it asks before edits, commands and
 * fetches, and each `session/request_permission` is translated into the
 * matching WrongStack tool call and decided by that policy.
 */
import type {
  PermissionPolicy as AcpPermissionPolicy,
  PermissionRequest as AcpPermissionRequest,
} from '@wrongstack/acp';
import type { PermissionDecision, Tool } from '@wrongstack/core/types';

/** The WrongStack tool call an ACP permission request stands for. */
export interface WrongStackCall {
  tool: string;
  input: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Translate a worker's permission request into the WrongStack call with the
 * same effect, or undefined when it has no counterpart (the worker's own MCP
 * tools, task lists, and the like), which WrongStack leaves to the worker.
 */
function wrongstackCallFor(
  req: Pick<AcpPermissionRequest, 'toolCall'>,
): WrongStackCall | undefined {
  const call = req.toolCall;
  const raw = call.rawInput ?? {};
  const path =
    str(raw.file_path) ?? str(raw.path) ?? str(raw.notebook_path) ?? call.locations?.[0]?.path;
  switch (call.kind) {
    case 'execute': {
      const command = str(raw.command);
      return command ? { tool: 'bash', input: { command } } : undefined;
    }
    case 'edit':
      if (!path) return undefined;
      return typeof raw.old_string === 'string'
        ? {
            tool: 'edit',
            input: { path, old_string: raw.old_string, new_string: str(raw.new_string) ?? '' },
          }
        : {
            tool: 'write',
            input: { path, content: typeof raw.content === 'string' ? raw.content : '' },
          };
    case 'delete':
      return path ? { tool: 'bash', input: { command: `rm ${JSON.stringify(path)}` } } : undefined;
    case 'move': {
      const to = str(raw.destination) ?? str(raw.new_path) ?? call.locations?.[1]?.path;
      return path && to
        ? { tool: 'bash', input: { command: `mv ${JSON.stringify(path)} ${JSON.stringify(to)}` } }
        : undefined;
    }
    case 'read':
    case 'search':
      return path ? { tool: 'read', input: { path } } : undefined;
    case 'fetch': {
      const url = str(raw.url);
      return url ? { tool: 'fetch', input: { url } } : undefined;
    }
    default:
      return undefined;
  }
}

export interface AcpPermissionBridgeOptions {
  /** WrongStack's subagent policy (an `AutoApprovePermissionPolicy`). */
  evaluate: (
    tool: Tool,
    input: unknown,
    ctx: { projectRoot: string; cwd: string },
  ) => Promise<PermissionDecision>;
  /** Resolve a WrongStack tool by name (the host's tool registry). */
  getTool: (name: string) => Tool | undefined;
  projectRoot: string;
  /** Told about every refusal, for the host's log. */
  onRefused?: ((call: WrongStackCall, reason: string) => void) | undefined;
}

function pick(req: AcpPermissionRequest, allow: boolean) {
  const kinds = allow ? ['allow_once'] : ['reject_once', 'reject_always'];
  const option = req.options.find((o) => kinds.includes(o.kind));
  return option
    ? ({ outcome: 'selected', optionId: option.optionId } as const)
    : ({ outcome: 'cancelled' } as const);
}

export function wrongstackAcpPermissionPolicy(
  opts: AcpPermissionBridgeOptions,
): AcpPermissionPolicy {
  return async (req) => {
    if (req.signal.aborted) return { outcome: 'cancelled' };
    const call = wrongstackCallFor(req);
    if (!call) return pick(req, true);
    const tool = opts.getTool(call.tool);
    // Without the tool there is nothing to check against; refusing would
    // stop every worker on a host that trimmed its registry.
    if (!tool) return pick(req, true);
    let decision: PermissionDecision;
    try {
      decision = await opts.evaluate(tool, call.input, {
        projectRoot: opts.projectRoot,
        cwd: opts.projectRoot,
      });
    } catch (err) {
      // Fail closed: a policy that cannot decide must not wave a call through.
      decision = {
        permission: 'deny',
        source: 'default',
        reason: `permission check failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    // `confirm` is a question a worker's request cannot carry to the user.
    const allowed = decision.permission === 'auto';
    if (!allowed) opts.onRefused?.(call, decision.reason ?? decision.source);
    return pick(req, allowed);
  };
}
