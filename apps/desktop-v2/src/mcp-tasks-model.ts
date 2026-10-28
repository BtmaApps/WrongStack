import type { MCPTaskView } from '@wrongstack/webui-protocol';
import { entries } from './engine-values';

export const mcpTaskStatuses = [
  'working',
  'input_required',
  'completed',
  'cancelled',
  'failed',
] as const;
export function mcpTaskSnapshot(
  payload: Record<string, unknown>,
  sessionId: string,
): MCPTaskView[] {
  if (payload['sessionId'] !== sessionId || !Array.isArray(payload['tasks']))
    throw Error('MCP task response belongs to another session or has no task list.');
  const rows = entries(payload['tasks']);
  if (
    rows.length !== payload['tasks'].length ||
    rows.some(
      (row) =>
        !['id', 'server', 'tool', 'createdAt', 'lastUpdatedAt'].every(
          (key) => typeof row[key] === 'string' && row[key],
        ) ||
        !mcpTaskStatuses.includes(row['status'] as MCPTaskView['status']) ||
        typeof row['delivered'] !== 'boolean' ||
        typeof row['observing'] !== 'boolean',
    )
  )
    throw Error('The engine returned an unrecognized MCP task record.');
  return rows.map((row) => ({
    id: String(row['id']),
    server: String(row['server']),
    tool: String(row['tool']),
    status: row['status'] as MCPTaskView['status'],
    createdAt: String(row['createdAt']),
    lastUpdatedAt: String(row['lastUpdatedAt']),
    delivered: row['delivered'] as boolean,
    observing: row['observing'] as boolean,
  }));
}
export function mcpTaskTerminal(task: MCPTaskView): boolean {
  return ['completed', 'cancelled', 'failed'].includes(task.status);
}
