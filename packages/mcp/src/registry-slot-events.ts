import type { MCPClient } from './client.js';
import { MCP_CONSTANTS } from './constants.js';
import type { MCPLogMessageNotification, MCPProgressNotification } from './protocol.js';
import { advanceCatalogVersion } from './registry-catalog.js';
import { markLazySlotDormant, resetDisconnectedSlotTools } from './registry-disconnect.js';
import type { MCPRegistryInternals } from './registry-internals.js';
import { scheduleRegistryReconnect } from './registry-reconnect.js';
import type { ServerSlot } from './registry-slots.js';

/**
 * Bodies of the `MCPRegistry` listeners a connected client notifies:
 * catalog/list-changed signals, live resource updates, progress/log
 * telemetry, child exit and transport disconnect (plus the reconnect they
 * schedule). The class keeps the stable arrow-function identities it
 * registers and delegates to these.
 */

/**
 * L2-C: handle `notifications/tools/list_changed` from the server.
 * Unregister the previous wrapper set, then re-register the fresh
 * tool list. The client has already refreshed its cache before
 * dispatching — we just need to re-wrap and re-register.
 * In lazy mode, only update the internal cache without registering.
 */
export function handleToolsChanged(self: MCPRegistryInternals, name: string): void {
  const slot = self.servers.get(name);
  if (!slot?.client) return;
  // applyTools swaps the registered set itself (and keeps an lazyMode
  // activation alive). No connection event: the connection did not change.
  const discovered = slot.client.listTools();
  self.applyTools(slot, discovered, slot.client);
  // Refresh the lazy manifest so a future cold boot sees the new tool set.
  void self.persistCapabilityManifest(slot);
  self.log.info(
    `MCP server "${slot.cfg.name}" tools refreshed (${self.toolNamesForSlot(slot).length} active)`,
  );
}

export function handleResourcesChanged(self: MCPRegistryInternals, name: string): void {
  const slot = self.servers.get(name);
  if (!slot) return;
  advanceCatalogVersion(slot, 'resources');
  advanceCatalogVersion(slot, 'resourceTemplates');
  slot.resources = undefined;
  slot.resourceTemplates = undefined;
  void self.persistCapabilityManifest(slot);
  self.log.info(`MCP server "${name}" resource catalog invalidated`);
}

export function handleResourceUpdated(self: MCPRegistryInternals, name: string, uri: string): void {
  if (!self.servers.has(name)) return;
  // A subscription is live data, not a catalog change: the list is still
  // valid, so nothing is invalidated. Surfaces that asked to subscribe get
  // the event; everyone else ignores it.
  self.events.emit('mcp.resource.updated', { name, uri });
}

export function handleProgress(
  self: MCPRegistryInternals,
  name: string,
  progress: MCPProgressNotification,
): void {
  if (!self.servers.has(name)) return;
  // Display-only telemetry for a long-running call; the payload is already
  // clamped/sanitized by the parser (attacker-controllable server output).
  self.events.emit('mcp.progress', { name, ...progress });
}

export function handleLogMessage(
  self: MCPRegistryInternals,
  name: string,
  log: MCPLogMessageNotification,
): void {
  if (!self.servers.has(name)) return;
  // Display-only server log line. Never consulted by permission, sandbox,
  // or tool-call decisions.
  self.events.emit('mcp.log', { name, ...log });
}

export function handlePromptsChanged(self: MCPRegistryInternals, name: string): void {
  const slot = self.servers.get(name);
  if (!slot) return;
  advanceCatalogVersion(slot, 'prompts');
  slot.prompts = undefined;
  void self.persistCapabilityManifest(slot);
  self.log.info(`MCP server "${name}" prompt catalog invalidated`);
}

export function attachCatalogListeners(self: MCPRegistryInternals, client: MCPClient): void {
  client.addResourcesChangedListener(self.onResourcesChanged);
  client.addPromptsChangedListener(self.onPromptsChanged);
  client.addResourceUpdatedListener?.(self.onResourceUpdated);
  client.addProgressListener?.(self.onProgress);
  client.addLogMessageListener?.(self.onLogMessage);
}

export function detachCatalogListeners(self: MCPRegistryInternals, client: MCPClient): void {
  client.removeResourcesChangedListener?.(self.onResourcesChanged);
  client.removePromptsChangedListener?.(self.onPromptsChanged);
  client.removeResourceUpdatedListener?.(self.onResourceUpdated);
  client.removeProgressListener?.(self.onProgress);
  client.removeLogMessageListener?.(self.onLogMessage);
}

export function handleChildExit(
  self: MCPRegistryInternals,
  name: string,
  code: number | null,
): void {
  const slot = self.servers.get(name);
  // Only the death of a LIVE connection is a disconnect. A client that fails
  // mid-handshake closes (and exits) with its listeners still attached; the
  // connect loop already owns that failure, and treating it here as well
  // scheduled a second, concurrent reconnect and made the loop abandon its
  // remaining attempts (it read the flipped 'disconnected' as a stop()).
  if (slot?.state !== 'connected') return;
  if (slot.lazy) {
    self.recordFailure(slot, 'transport', 'process-exit-lazy');
    markLazySlotDormant(slot, self.events, `exit:${code ?? 'unknown'}`, {
      onChildExit: self.onChildExit,
      onToolsChanged: self.onToolsChanged,
      removeCatalogListeners: (c) => self.removeCatalogListeners(c),
    });
    return;
  }
  resetDisconnectedSlotTools(slot, self.toolRegistry);
  slot.state = 'disconnected';
  self.recordFailure(slot, 'transport', 'process-exit');
  self.events.emit('mcp.server.disconnected', { name, reason: `exit:${code ?? 'unknown'}` });
  self.scheduleReconnect(slot);
}

/** Handles SSE / streamable-http disconnect — same recovery as stdio child exit. */
export function handleTransportDisconnect(self: MCPRegistryInternals, name: string): void {
  const slot = self.servers.get(name);
  // Same live-connection guard as onChildExit.
  if (slot?.state !== 'connected') return;
  if (slot.lazy) {
    self.recordFailure(slot, 'transport', 'http-disconnect-lazy');
    markLazySlotDormant(slot, self.events, 'http-disconnect', {
      onChildExit: self.onChildExit,
      onToolsChanged: self.onToolsChanged,
      removeCatalogListeners: (c) => self.removeCatalogListeners(c),
    });
    return;
  }
  resetDisconnectedSlotTools(slot, self.toolRegistry);
  slot.state = 'disconnected';
  self.recordFailure(slot, 'transport', 'http-disconnect');
  self.events.emit('mcp.server.disconnected', { name, reason: 'http-disconnect' });
  self.scheduleReconnect(slot);
}

const MAX_RECONNECT_CYCLES = MCP_CONSTANTS.RECONNECT.MAX_CYCLES;
const BASE_RECONNECT_DELAY_MS = MCP_CONSTANTS.RECONNECT.BASE_DELAY_MS;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function scheduleSlotReconnect(self: MCPRegistryInternals, slot: ServerSlot): void {
  scheduleRegistryReconnect({
    slot,
    events: self.events,
    log: self.log,
    maxReconnectCycles: MAX_RECONNECT_CYCLES,
    baseReconnectDelayMs: BASE_RECONNECT_DELAY_MS,
    maxReconnectDelayMs: MAX_RECONNECT_DELAY_MS,
    recordReconnectExhausted: (target) =>
      self.recordFailure(target, 'transport', 'reconnect-exhausted'),
    attemptReconnect: (target) => self.attemptReconnect(target),
  });
}

export async function attemptSlotReconnect(
  self: MCPRegistryInternals,
  slot: ServerSlot,
): Promise<void> {
  slot.reconnectPending = false;
  slot.reconnectCycles++;
  slot.operations.reconnectCount++;
  self.recordOperation(slot, 'reconnect', 'automatic');
  // Through the single-flight gate: a tool call waking the slot at the same
  // moment must share this connect, not spawn a second process.
  await self.singleFlightConnect(slot);
}
