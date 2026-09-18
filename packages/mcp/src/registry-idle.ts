import type { EventBus } from '@wrongstack/core/kernel';
import type { Logger } from '@wrongstack/core/types';
import type { MCPClient } from './client.js';
import type { MCPOperationKind } from './operations.js';
import type { ServerSlot } from './registry-slots.js';

export interface RegistryIdleContext {
  servers: Map<string, ServerSlot>;
  idleTimeoutMs: number;
  events: EventBus;
  log: Logger;
  recordOperation: (slot: ServerSlot, kind: MCPOperationKind, reason?: string) => void;
  onChildExit: (name: string, code: number | null, signal: string | null) => void;
  onToolsChanged: (name: string, tools: { name: string }[]) => void;
  removeCatalogListeners: (client: MCPClient) => void;
}

export async function sleepIdleSlot(ctx: RegistryIdleContext, slot: ServerSlot): Promise<void> {
  if (slot.operations.inFlightCalls > 0) return;
  slot.reconnectPending = false;
  if (slot.reconnectTimer) {
    clearTimeout(slot.reconnectTimer);
    slot.reconnectTimer = undefined;
  }
  // Detach BEFORE awaiting close, matching stop() and markLazySlotDormant:
  // while the close is pending the slot must not advertise
  // `state === 'connected'` with a live client, or ensureConnected's fast
  // path resolves a demand-wake with the closing client (failing that tool
  // call), and an overlapping sweep re-enters this function (double close,
  // double sleepCount, duplicate idle-sleep event).
  slot.state = 'dormant';
  const client = slot.client;
  slot.client = undefined;
  if (client) {
    client.removeExitListener?.(ctx.onChildExit);
    if (slot.onDisconnect) client.removeDisconnectListener?.(slot.onDisconnect);
    client.removeToolsChangedListener?.(ctx.onToolsChanged);
    ctx.removeCatalogListeners(client);
    try {
      await client.close?.();
    } catch (err) {
      ctx.log.warn(`MCP server "${slot.cfg.name}" error during idle sleep close`, err);
    }
  }
  slot.onDisconnect = undefined;
  slot.operations.sleepCount++;
  ctx.recordOperation(slot, 'sleep', 'idle-timeout');
  ctx.log.info(`MCP server "${slot.cfg.name}" idle — sleeping (tools stay registered)`);
  ctx.events.emit('mcp.server.disconnected', { name: slot.cfg.name, reason: 'idle-sleep' });
}

export async function sweepIdleSlots(ctx: RegistryIdleContext): Promise<boolean> {
  if (ctx.idleTimeoutMs <= 0) return false;
  const now = Date.now();
  for (const slot of ctx.servers.values()) {
    if (
      slot.lazy &&
      slot.state === 'connected' &&
      slot.client &&
      slot.operations.inFlightCalls === 0 &&
      now - slot.lastUsed > ctx.idleTimeoutMs
    ) {
      await sleepIdleSlot(ctx, slot);
    }
  }
  return [...ctx.servers.values()].some(
    (slot) => slot.lazy && slot.state === 'connected' && slot.client,
  );
}
