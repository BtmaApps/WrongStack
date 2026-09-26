import { toast } from '@/components/Toaster';
import { i18n } from '@/i18n';
import type { WSServerMessage } from '@/types';

/**
 * Page-wide MCP status toasts. The MCP settings section tracks every state
 * change, but only while it is open; a server that failed for good while the
 * person was chatting went unnoticed. Only a `terminal` disconnect is shown —
 * connect attempts or reconnect cycles exhausted, nothing retries by itself.
 * A stop, an idle sleep or a drop an automatic reconnect follows stays quiet.
 * Each failure toasts once; the recovery toast only follows one of those.
 */
const reportedDown = new Set<string>();

function serverName(msg: WSServerMessage): string | null {
  const name = (msg.payload as { name?: unknown } | undefined)?.name;
  return typeof name === 'string' && name ? name : null;
}

export function handleMcpServerDisconnected(msg: WSServerMessage): void {
  const name = serverName(msg);
  const payload = msg.payload as { reason?: unknown; terminal?: unknown };
  if (!name || payload.terminal !== true || reportedDown.has(name)) return;
  reportedDown.add(name);
  const reason =
    (typeof payload.reason === 'string' ? payload.reason.split('\n')[0]?.trim() : '') || 'unknown';
  toast.warn(
    i18n.t('common:mcpStatus.down', {
      name,
      reason,
      defaultValue:
        'MCP server "{{name}}" is not connected ({{reason}}); its tools are unavailable. Retry with /mcp restart {{name}}.',
    }),
    10_000,
  );
}

export function handleMcpServerUp(msg: WSServerMessage): void {
  const name = serverName(msg);
  if (!name || !reportedDown.delete(name)) return;
  toast.info(
    i18n.t('common:mcpStatus.up', {
      name,
      defaultValue: 'MCP server "{{name}}" is connected again.',
    }),
  );
}

/** Test seam: forget which servers were reported down. */
export function _resetMcpStatusHandlersForTests(): void {
  reportedDown.clear();
}
