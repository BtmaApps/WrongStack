/**
 * MCP management handlers for the WebUI server (both the standalone
 * standalone server and the CLI's embedded `--webui` server).
 *
 * These are thin WebSocket translators over the shared, surface-agnostic
 * management core in `@wrongstack/mcp` (`manage.ts`) — the SAME core the REPL
 * `/mcp` command writes against (same config.json, same MCPRegistry). All the
 * config IO, url/header persistence, and live registry start/stop logic lives
 * there; here we only map structured results to WS events the browser expects.
 */

import { allServers } from '@wrongstack/core/infrastructure';
import type { TrustBoundary } from '@wrongstack/core/security';
import { toErrorMessage } from '@wrongstack/core/utils';
import {
  addMcp,
  disableMcp,
  discoverMcp,
  enableMcp,
  listMcp,
  type MCPRegistry,
  type McpServerInput,
  removeMcp,
  restartMcp,
  updateMcp,
} from '@wrongstack/mcp';
import type { WebSocket } from 'ws';
import { authorizeMcpMutation, deps, name } from './mcp-handler-guards.js';
import { toolAnnotationsFor, toView } from './mcp-server-view.js';
import type { WSClientMessage } from './types.js';
import { validateMcpServerPayload } from './ws-payload-validation.js';
import { send } from './ws-utils.js';

export {
  handleMcpAuthLogin,
  handleMcpAuthLogout,
  handleMcpAuthStatus,
} from './mcp-auth-handlers.js';
export {
  handleMcpPromptGet,
  handleMcpPrompts,
  handleMcpResourceRead,
  handleMcpResources,
} from './mcp-content-handlers.js';
export { toView } from './mcp-server-view.js';

/** mcp.list — configured servers merged with live registry status + tools. */
export async function handleMcpList(
  ws: WebSocket,
  _msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  if (!mcpRegistry || !globalConfigPath) {
    send(ws, { type: 'mcp.list', payload: { servers: [] } });
    return;
  }
  const servers = await listMcp({
    configPath: globalConfigPath,
    registry: mcpRegistry,
    presets: allServers(),
  });
  const health = new Map(
    (typeof mcpRegistry.operationalHealth === 'function'
      ? mcpRegistry.operationalHealth()
      : []
    ).map((item) => [item.name, item]),
  );
  send(ws, {
    type: 'mcp.list',
    payload: {
      servers: servers.map((server) =>
        toView(server, health.get(server.name), toolAnnotationsFor(mcpRegistry, server.name)),
      ),
    },
  });
}

/** mcp.add — persist a new server (incl. url/headers) and start it if enabled. */
export async function handleMcpAdd(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  const validated = validateMcpServerPayload(msg.payload, 'mcp.add');
  if (!validated.ok) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: validated.message },
    });
    return;
  }
  if (!(await authorizeMcpMutation(ws, 'mcp.add', name(msg), trustBoundary))) return;
  const result = await addMcp(validated.value as unknown as McpServerInput, d);
  if (result.ok && result.server) {
    send(ws, { type: 'mcp.server.added', payload: { server: toView(result.server) } });
    if (result.registryError) {
      send(ws, {
        type: 'mcp.server.error',
        payload: { name: result.server.name, error: result.registryError },
      });
    } else if (result.server.enabled) {
      send(ws, { type: 'mcp.server.connected', payload: { name: result.server.name } });
    }
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.update — re-persist config (incl. url/headers) and re-apply to registry. */
export async function handleMcpUpdate(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  const validated = validateMcpServerPayload(msg.payload, 'mcp.update');
  if (!validated.ok) {
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: validated.message },
    });
    return;
  }
  if (!(await authorizeMcpMutation(ws, 'mcp.update', name(msg), trustBoundary))) return;
  const result = await updateMcp(validated.value as unknown as McpServerInput, d);
  if (result.ok && result.server) {
    send(ws, { type: 'mcp.server.updated', payload: { server: toView(result.server) } });
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.remove — stop the server and delete it from config. */
export async function handleMcpRemove(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  const result = await removeMcp(name(msg), d);
  if (result.ok) {
    send(ws, { type: 'mcp.server.removed', payload: { name: name(msg) } });
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.enable — flip enabled:true in config and start the server. */
export async function handleMcpEnable(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // H-2 (security report VF-04): enable is spawn-capable — it starts the
  // configured server process — and unlike add/update it never crossed the
  // trust boundary. Same authorization as the spawn-capable pair.
  if (!(await authorizeMcpMutation(ws, 'mcp.enable', name(msg), trustBoundary))) return;
  const result = await enableMcp(name(msg), d);
  if (result.ok && result.server) {
    send(ws, { type: 'mcp.server.updated', payload: { server: toView(result.server) } });
    if (result.registryError) {
      send(ws, {
        type: 'mcp.server.error',
        payload: { name: name(msg), error: result.registryError },
      });
    } else {
      send(ws, { type: 'mcp.server.connected', payload: { name: name(msg) } });
    }
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.disable — stop the server and flip enabled:false in config. */
export async function handleMcpDisable(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // H-2: disable mutates persisted config from a bare name frame; route it
  // through the same authorizer as its siblings (audit record under the
  // default policy, enforceable where a stricter boundary is installed).
  if (!(await authorizeMcpMutation(ws, 'mcp.disable', name(msg), trustBoundary))) return;
  const result = await disableMcp(name(msg), d);
  if (result.ok) {
    send(ws, { type: 'mcp.server.sleeping', payload: { name: name(msg) } });
    if (result.server) {
      send(ws, { type: 'mcp.server.updated', payload: { server: toView(result.server) } });
    }
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.sleep — stop a running server (config stays enabled). */
export async function handleMcpSleep(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // Sleep == stop the live process but keep config enabled — use the registry
  // directly so the persisted `enabled` flag is untouched. `sleep()` keeps a
  // lazy server's tools registered (dormant); `stop()` would unregister them.
  try {
    if (typeof d.registry.sleep === 'function') await d.registry.sleep(name(msg));
    else await d.registry.stop(name(msg));
    send(ws, { type: 'mcp.server.sleeping', payload: { name: name(msg) } });
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: true, message: `Server "${name(msg)}" stopped` },
    });
  } catch (err) {
    const error = toErrorMessage(err);
    send(ws, { type: 'mcp.server.error', payload: { name: name(msg), error } });
    send(ws, {
      type: 'mcp.operation_result',
      payload: { success: false, message: `Failed to stop "${name(msg)}": ${error}` },
    });
  }
}

/** mcp.wake — restart a sleeping/stopped server from config. */
export async function handleMcpWake(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // Chimera review follow-up to H-2: wake reaches restartMcp() → startServer()
  // → registry.start(), i.e. it spawns the configured server process, exactly
  // like enable — a strict boundary that denies mcp.enable must not be
  // bypassable through mcp.wake.
  if (!(await authorizeMcpMutation(ws, 'mcp.wake', name(msg), trustBoundary))) return;
  send(ws, { type: 'mcp.server.waking', payload: { name: name(msg) } });
  const result = await restartMcp(name(msg), d);
  if (result.ok && !result.registryError) {
    send(ws, { type: 'mcp.server.connected', payload: { name: name(msg) } });
  } else if (result.registryError) {
    send(ws, {
      type: 'mcp.server.error',
      payload: { name: name(msg), error: result.registryError },
    });
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.restart — stop + start a server. */
export async function handleMcpRestart(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // Same spawn-capable class as wake/enable — see handleMcpWake.
  if (!(await authorizeMcpMutation(ws, 'mcp.restart', name(msg), trustBoundary))) return;
  const result = await restartMcp(name(msg), d);
  if (result.ok && !result.registryError) {
    send(ws, { type: 'mcp.server.connected', payload: { name: name(msg) } });
  } else if (result.registryError) {
    send(ws, {
      type: 'mcp.server.error',
      payload: { name: name(msg), error: result.registryError },
    });
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}

/** mcp.discover — ensure the server is running and report its live tools. */
export async function handleMcpDiscover(
  ws: WebSocket,
  msg: WSClientMessage,
  globalConfigPath: string,
  mcpRegistry?: MCPRegistry,
  trustBoundary?: TrustBoundary,
): Promise<void> {
  const d = deps(ws, globalConfigPath, mcpRegistry);
  if (!d) return;
  // discoverMcp → restartMcp → registry.start: it spawns the configured
  // server (disabled ones included), the same class as restart/wake/enable.
  // Without this check a boundary that refused mcp.restart still spawned
  // through mcp.discover.
  if (!(await authorizeMcpMutation(ws, 'mcp.discover', name(msg), trustBoundary))) return;
  const result = await discoverMcp(name(msg), d);
  if (result.ok) {
    // Hints the live server claimed for its freshly discovered tools. Absent
    // (not empty) when the server annotated nothing — absence is no claim.
    const toolAnnotations = toolAnnotationsFor(d.registry, name(msg));
    send(ws, {
      type: 'mcp.server.discovered',
      payload: {
        name: name(msg),
        tools: result.tools ?? [],
        ...(toolAnnotations !== undefined ? { toolAnnotations } : {}),
      },
    });
  }
  send(ws, {
    type: 'mcp.operation_result',
    payload: { success: result.ok, message: result.message },
  });
}
