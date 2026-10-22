import type { MCPRegistry } from '@wrongstack/mcp';
import type { MCPTaskView } from '@wrongstack/webui-protocol';

export function taskViews(receipts: Awaited<ReturnType<MCPRegistry['listTasks']>>): MCPTaskView[] {
  return receipts.map((r) => ({
    id: r.id,
    server: r.server,
    tool: r.tool,
    status: r.status,
    createdAt: r.createdAt,
    lastUpdatedAt: r.lastUpdatedAt,
    delivered: r.delivered,
    observing: !r.delivered && (r.leaseExpiresAt ?? 0) > Date.now(),
  }));
}
