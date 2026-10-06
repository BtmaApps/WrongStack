import { allServers } from '@wrongstack/core/infrastructure';
import type { TrustBoundary } from '@wrongstack/core/security';
import type { MCPRegistry, McpManageDeps } from '@wrongstack/mcp';
import type { WebSocket } from 'ws';
import { authorizeWebUIAction } from './privileged-actions.js';
import type { WSClientMessage } from './types.js';
import { send } from './ws-utils.js';

/**
 * Run an MCP mutation that ends in a process spawn past the trust boundary.
 *
 * Security scan 2026-08-04, finding M1. `mcp.add`/`mcp.update` accept an
 * arbitrary `command` + `args` from the wire, persist them to the profile
 * config, and start the server — the only WS-reachable spawn path that never
 * consulted the boundary its siblings (`terminal.create`, `process.kill`,
 * `host.shutdown`, codebase-index control) all go through.
 *
 * Risk is `'elevated'`, not `'critical'`, for the reason spelled out at the
 * `host.shutdown` call site: the default compatibility policy denies
 * `'critical'` outright for `remote-client` actors, which would break MCP
 * management in the WebUI for everyone. **Be clear about what this buys.**
 * Under the default policy it does not block anything — it produces an audit
 * record for every spawn-capable config mutation and gives a deployment that
 * installs a stricter boundary a place to say no. That is defense in depth,
 * not a gate.
 */
export async function authorizeMcpMutation(
  ws: WebSocket,
  operation:
    | 'mcp.add'
    | 'mcp.update'
    | 'mcp.enable'
    | 'mcp.disable'
    | 'mcp.wake'
    | 'mcp.restart'
    | 'mcp.auth.login'
    | 'mcp.auth.logout',
  serverName: string,
  trustBoundary: TrustBoundary | undefined,
): Promise<boolean> {
  if (!trustBoundary) return true;
  const authorization = await authorizeWebUIAction(trustBoundary, {
    capability: 'mcp.server.configure',
    subject: { kind: 'process', id: serverName },
    risk: 'elevated',
    metadata: { transport: 'websocket', operation },
  });
  if (!authorization.allowed) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: `${operation} denied: ${authorization.reason}` },
    });
  }
  return authorization.allowed;
}

/**
 * Build the shared management deps. Returns null (and sends a failure result)
 * when the live registry isn't wired — both WebUI servers now pass one, so this
 * is a defensive guard rather than the normal path.
 */
export function deps(
  ws: WebSocket,
  globalConfigPath: string | undefined,
  registry: MCPRegistry | undefined,
): McpManageDeps | null {
  if (!registry || !globalConfigPath) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: 'MCP registry is not available in this session.' },
    });
    return null;
  }
  return { configPath: globalConfigPath, registry, presets: allServers() };
}

export function name(msg: WSClientMessage): string {
  return (msg.payload as { name?: string } | undefined)?.name ?? '';
}
