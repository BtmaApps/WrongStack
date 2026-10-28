import type { Context } from '@wrongstack/core/agent';
import type { MCPRegistry } from '@wrongstack/mcp';
import type { WebSocket } from 'ws';
import type { McpRouteHandlers } from './mcp-routes.js';
import { isMcpTaskIdentifier, isMcpTaskSessionId } from './mcp-task-identifiers.js';
import { taskViews } from './mcp-task-view.js';
import { send } from './ws-utils.js';

interface Watch {
  requestId: string;
  stop: () => void;
}
interface Connection {
  watches: Map<string, Watch>;
  close: () => void;
}

/** Host-local subscriptions. They never invoke an MCP tool or resume a remote task. */
export function createTaskSubscriptions(deps: {
  registry: MCPRegistry | undefined;
  context: (sessionId: string) => Context | undefined;
}): Pick<McpRouteHandlers, 'tasksSubscribe' | 'tasksUnsubscribe'> {
  const connections = new WeakMap<WebSocket, Connection>();
  const handle: McpRouteHandlers['list'] = async (ws, msg) => {
    const p = msg.payload as Record<string, unknown> | undefined;
    const sessionId = isMcpTaskSessionId(p?.sessionId) ? p.sessionId : '';
    const requestId = isMcpTaskIdentifier(p?.requestId) ? p.requestId : '';
    const fail = () =>
      send(ws, {
        type: 'mcp.tasks.result',
        payload: {
          sessionId,
          requestId,
          success: false,
          message: 'MCP task updates unavailable. Refresh to try again.',
        },
      });
    if (!sessionId || !requestId) {
      fail();
      return;
    }
    let connection = connections.get(ws);
    if (msg.type === 'mcp.tasks.unsubscribe') {
      const old = connection?.watches.get(sessionId);
      if (old?.requestId === requestId) old.stop();
      return;
    }
    const context = deps.context(sessionId),
      registry = deps.registry;
    const agentId = context?.agentId;
    const current = () =>
      context &&
      context.agentId === agentId &&
      deps.context(sessionId) === context &&
      (context.eventSessionId?.() ?? context.session.id) === sessionId;
    if (
      !context ||
      !registry ||
      typeof registry.subscribeTasks !== 'function' ||
      !current() ||
      ws.readyState !== 1
    ) {
      fail();
      return;
    }
    if (!connection) {
      const watches = new Map<string, Watch>();
      const close = () => {
        for (const watch of [...watches.values()]) watch.stop();
      };
      connection = { watches, close };
      connections.set(ws, connection);
      ws.once('close', close);
    }
    connection.watches.get(sessionId)?.stop();
    // stop() removes an empty connection, so register this live connection again.
    if (!connections.has(ws)) {
      connections.set(ws, connection);
      ws.once('close', connection.close);
    }
    if (connection.watches.size >= 4) {
      fail();
      return;
    }
    const watches = connection.watches;
    let active = true,
      running = false,
      dirty = false,
      last = '',
      revision = 0;
    let off: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      off?.();
      if (watches.get(sessionId)?.requestId === requestId) watches.delete(sessionId);
      if (!watches.size) {
        ws.off('close', connection!.close);
        connections.delete(ws);
      }
    };
    const failed = () => {
      if (active) {
        stop();
        fail();
      }
    };
    const pump = async () => {
      if (!active) return;
      dirty = true;
      if (running) return;
      running = true;
      try {
        do {
          dirty = false;
          if (!current() || ws.readyState !== 1 || ws.bufferedAmount > 1_048_576) {
            failed();
            break;
          }
          const receipts = await registry.listTasks(context);
          if (!active) break;
          if (!current() || ws.readyState !== 1 || ws.bufferedAmount > 1_048_576) {
            failed();
            break;
          }
          clearTimeout(timer);
          const expiry = Math.min(
            ...receipts
              .filter((r) => !r.delivered && (r.leaseExpiresAt ?? 0) > Date.now())
              .map((r) => r.leaseExpiresAt!),
          );
          if (Number.isFinite(expiry)) {
            timer = setTimeout(
              () => {
                void pump();
              },
              Math.min(2_147_483_647, Math.max(1, expiry - Date.now() + 5)),
            );
            timer.unref?.();
          }
          const tasks = taskViews(receipts),
            serialized = JSON.stringify(tasks);
          if (serialized !== last) {
            last = serialized;
            send(ws, {
              type: 'mcp.tasks.changed',
              payload: { sessionId, requestId, revision: ++revision, tasks },
            });
          }
        } while (active && dirty);
      } catch {
        failed();
      } finally {
        running = false;
      }
    };
    watches.set(sessionId, { requestId, stop });
    try {
      off = await registry.subscribeTasks(
        context,
        () => {
          void pump();
        },
        failed,
      );
      if (!active) {
        off();
        return;
      }
      await pump();
    } catch {
      failed();
    }
  };
  return { tasksSubscribe: handle, tasksUnsubscribe: handle };
}
