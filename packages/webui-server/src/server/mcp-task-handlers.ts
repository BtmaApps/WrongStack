import type { Agent, Context } from '@wrongstack/core/agent';
import type { TrustBoundary } from '@wrongstack/core/security';
import type { MCPRegistry } from '@wrongstack/mcp';
import type { McpRouteHandlers } from './mcp-routes.js';
import { isMcpTaskIdentifier, isMcpTaskSessionId } from './mcp-task-identifiers.js';
import { createTaskSubscriptions } from './mcp-task-subscriptions.js';
import { taskViews } from './mcp-task-view.js';
import { authorizeWebUIAction } from './privileged-actions.js';
import { send } from './ws-utils.js';

/** Read-only resolution: a stale browser ID must never create a new agent. */
export function resolveMcpTaskContext(
  root: Context,
  peek: ((sessionId?: string) => Agent | undefined) | undefined,
  sessionId: string,
): Context | undefined {
  const context = peek?.(sessionId)?.ctx ?? (root.session.id === sessionId ? root : undefined);
  return context && (context.eventSessionId?.() ?? context.session.id) === sessionId
    ? context
    : undefined;
}

export function createMcpTaskHandlers(deps: {
  registry: MCPRegistry | undefined;
  context: (sessionId: string) => Context | undefined;
  trustBoundary?: TrustBoundary | undefined;
}): Pick<
  McpRouteHandlers,
  'tasksList' | 'tasksRetry' | 'tasksCancel' | 'tasksSubscribe' | 'tasksUnsubscribe'
> {
  const handle: McpRouteHandlers['list'] = async (ws, msg) => {
    const p = msg.payload as Record<string, unknown> | undefined;
    const sessionId = isMcpTaskSessionId(p?.sessionId) ? p.sessionId : '';
    const requestId = isMcpTaskIdentifier(p?.requestId) ? p.requestId : '';
    const result = (success: boolean, message: string) =>
      send(ws, { type: 'mcp.tasks.result', payload: { sessionId, requestId, success, message } });
    if (
      !sessionId ||
      !requestId ||
      (msg.type !== 'mcp.tasks.list' && !isMcpTaskIdentifier(p?.id))
    ) {
      result(false, 'Invalid MCP task request.');
      return;
    }
    const context = deps.context(sessionId),
      registry = deps.registry;
    const current = () =>
      context && (context.eventSessionId?.() ?? context.session.id) === sessionId;
    if (!context || !registry || !current()) {
      result(false, 'This session is unavailable.');
      return;
    }
    try {
      if (msg.type === 'mcp.tasks.list') {
        const tasks = taskViews(await registry.listTasks(context));
        if (!current()) {
          result(false, 'This session changed.');
          return;
        }
        send(ws, {
          type: 'mcp.tasks.list',
          payload: {
            sessionId,
            requestId,
            tasks,
            streaming: typeof registry.subscribeTasks === 'function',
          },
        });
        return;
      }
      const operation = msg.type === 'mcp.tasks.cancel' ? 'mcp.tasks.cancel' : 'mcp.tasks.retry';
      const receipt = (await registry.listTasks(context)).find(
        (r) => r.id === p!.id && !r.delivered,
      );
      if (!receipt || !current()) {
        result(false, 'This task is unavailable.');
        return;
      }
      if (
        deps.trustBoundary &&
        !(
          await authorizeWebUIAction(deps.trustBoundary, {
            capability: 'mcp.server.configure',
            subject: { kind: 'process', id: receipt.server },
            risk: 'elevated',
            sessionId,
            metadata: { transport: 'websocket', operation },
          })
        ).allowed
      ) {
        result(false, 'MCP task action denied.');
        return;
      }
      if (!current()) {
        result(false, 'This session changed.');
        return;
      }
      if (operation === 'mcp.tasks.cancel') {
        await registry.cancelTask(context, p!.id as string);
        result(true, 'Cancellation requested. The server will confirm the final status.');
      } else {
        const outcome = await registry.retryTask(context, p!.id as string);
        result(
          outcome !== 'unavailable',
          outcome === 'requested'
            ? 'Recovery requested.'
            : outcome === 'busy'
              ? 'This task is already being observed.'
              : 'This task is unavailable.',
        );
      }
    } catch {
      result(false, 'MCP task action failed. Check the server connection and active account.');
    }
  };
  return {
    tasksList: handle,
    tasksRetry: handle,
    tasksCancel: handle,
    ...createTaskSubscriptions(deps),
  };
}
