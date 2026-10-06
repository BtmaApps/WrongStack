import type { TrustBoundary } from '@wrongstack/core/security';
import { toErrorMessage } from '@wrongstack/core/utils';
import type { MCPRegistry } from '@wrongstack/mcp';
import type { WebSocket } from 'ws';
import { authorizeMcpMutation, deps, name } from './mcp-handler-guards.js';
import type { WSClientMessage } from './types.js';
import { send } from './ws-utils.js';

// ── OAuth authorization ───────────────────────────────────────────────────
//
// The manager was constructed in `pre-context-services.ts` but reachable only
// from the REPL's `/mcp auth` slash command, and the WebUI has no slash-command
// dispatch — so a browser user could add an OAuth-protected HTTP server and
// then had no way to authorize it. These three handlers close that gap over
// the same surface-neutral manager the CLI uses.
//
// The loopback redirect receiver binds on the machine running this server, not
// in the browser. That is correct for the local WebUI (same machine) and is the
// reason `mcp.auth.login` is gated on the trust boundary like the spawn-capable
// mutations: for a remotely-served WebUI it opens a port on the host.

function authScopes(msg: WSClientMessage): string[] | undefined {
  const raw = (msg.payload as { scopes?: unknown } | undefined)?.scopes;
  if (!Array.isArray(raw)) return undefined;
  const scopes = raw.filter((value): value is string => typeof value === 'string' && !!value);
  return scopes.length > 0 ? scopes.slice(0, 64) : undefined;
}

function authClientId(msg: WSClientMessage): string | undefined {
  const raw = (msg.payload as { clientId?: unknown } | undefined)?.clientId;
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 4_096 ? raw : undefined;
}

/** mcp.auth.status — non-secret authorization state for one HTTP server. */
export async function handleMcpAuthStatus(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  try {
    const status = await d.registry.authorizationStatus(name(msg));
    send(ws, { type: 'mcp.auth.status', payload: status });
  } catch (err) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: `MCP auth status failed: ${toErrorMessage(err)}` },
    });
  }
}

/** mcp.auth.login — start OAuth and hand the browser the authorization URL. */
export async function handleMcpAuthLogin(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  if (!(await authorizeMcpMutation(ws, 'mcp.auth.login', name(msg), trustBoundary))) return;
  try {
    const handle = await d.registry.loginAuthorization(name(msg), {
      clientId: authClientId(msg),
      ...(authScopes(msg) ? { scopes: authScopes(msg)! } : {}),
    });
    // The URL is available now; the redirect may take minutes. The browser
    // opens the URL and learns the outcome from `mcp.server.auth_state`.
    send(ws, {
      type: 'mcp.auth.pending',
      payload: {
        name: name(msg),
        authorizationUrl: handle.started.authorizationUrl,
        redirectUri: handle.started.redirectUri,
        scopes: handle.started.scopes,
        expiresAt: handle.started.expiresAt,
        clientIdSource: handle.started.clientIdSource,
      },
    });
    void handle.completion.catch((err: unknown) => {
      send(ws, {
        type: 'mcp.operation_result',
        payload: {
          success: false,
          message: `MCP OAuth sign-in failed for "${name(msg)}": ${toErrorMessage(err)}`,
        },
      });
    });
  } catch (err) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: `MCP auth login failed: ${toErrorMessage(err)}` },
    });
  }
}

/** mcp.auth.logout — forget stored credentials for one HTTP server. */
export async function handleMcpAuthLogout(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  if (!(await authorizeMcpMutation(ws, 'mcp.auth.logout', name(msg), trustBoundary))) return;
  try {
    const removed = await d.registry.disconnectAuthorization(name(msg));
    send(ws, {
      type: 'mcp.operation_result',
      payload: {
        success: true,
        message: removed
          ? `Removed stored OAuth credentials for "${name(msg)}"`
          : `No stored OAuth credentials for "${name(msg)}"`,
      },
    });
  } catch (err) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: `MCP auth logout failed: ${toErrorMessage(err)}` },
    });
  }
}
