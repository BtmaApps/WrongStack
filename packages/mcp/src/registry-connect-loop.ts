import type { EventBus } from '@wrongstack/core/kernel';
import type { ToolRegistry } from '@wrongstack/core/registry';
import type { Logger } from '@wrongstack/core/types';
import { expectDefined } from '@wrongstack/core/utils';
import { MCPClient } from './client.js';
import { MCP_CONSTANTS } from './constants.js';
import type { ConnectionState, MCPTool } from './contracts.js';
import { manifestConfigHash, writeCapabilityManifest } from './manifest-cache.js';
import {
  MCP_OPERATION_LIMITS,
  type MCPFailureKind,
  type MCPOperationKind,
  type MCPOperationListener,
  pushBounded,
} from './operations.js';
import { collectCatalogPages } from './registry-catalog.js';
import type { ServerSlot } from './registry-slots.js';
import type { MCPRegistryOptions } from './registry-types.js';
import { wrapMCPTool } from './wrap-tool.js';

export interface RegistryConnectContext {
  servers: Map<string, ServerSlot>;
  toolRegistry: ToolRegistry;
  events: EventBus;
  log: Logger;
  lazyMode: boolean;
  cacheDir?: string | undefined;
  cwd?: string | undefined;
  authorizationProviderFactory?: MCPRegistryOptions['authorizationProviderFactory'] | undefined;
  operationListeners: Set<MCPOperationListener>;
  ensureConnected: (name: string) => Promise<MCPClient>;
  recordOperation: (
    slot: ServerSlot,
    kind: MCPOperationKind,
    reason?: string,
    failureKind?: MCPFailureKind,
    durationMs?: number,
    retain?: boolean,
  ) => void;
  recordSuccess: (slot: ServerSlot, resetFailures?: boolean) => void;
  recordFailure: (
    slot: ServerSlot,
    failureKind: MCPFailureKind,
    reason: string,
    durationMs?: number,
  ) => void;
  onChildExit: (name: string, code: number | null, signal: string | null) => void;
  onTransportDisconnect: (name: string) => void;
  onToolsChanged: (name: string, tools: { name: string }[]) => void;
  addCatalogListeners: (client: MCPClient) => void;
  removeCatalogListeners: (client: MCPClient) => void;
  ensureIdleSweep: () => void;
}

export function applySlotTools(
  ctx: RegistryConnectContext,
  slot: ServerSlot,
  tools: MCPTool[],
  client?: MCPClient | undefined,
): void {
  slot.discoveredTools = tools;
  const allowed = slot.cfg.allowedTools;
  const filtered = tools.filter((t) => !allowed || allowed.includes(t.name));
  const signature = JSON.stringify(
    filtered.map((t) => [t.name, t.description ?? null, t.inputSchema ?? null]),
  );
  // Lazy wrappers resolve the live client on every call, so an unchanged tool
  // set needs no rebinding on wake. A CHANGED set must be re-registered — the
  // old early-return kept the manifest's stale schemas registered forever once
  // the server's real tool list moved on.
  const lazyWrappersCurrent =
    slot.lazy &&
    slot.toolSignature === signature &&
    slot.lazyTools.length === filtered.length &&
    (slot.registeredLazy || ctx.lazyMode);
  if (lazyWrappersCurrent) return;
  const clientArg = slot.lazy ? () => ctx.ensureConnected(slot.cfg.name) : expectDefined(client);
  const wrapped = filtered.map((t) =>
    wrapMCPTool(slot.cfg.name, t, clientArg, slot.cfg.permission ?? 'confirm', {
      onStart: () => {
        slot.operations.inFlightCalls++;
        slot.operations.peakInFlightCalls = Math.max(
          slot.operations.peakInFlightCalls,
          slot.operations.inFlightCalls,
        );
        ctx.recordOperation(slot, 'call', 'started', undefined, undefined, false);
      },
      onFinish: ({ durationMs, ok }) => {
        slot.operations.inFlightCalls = Math.max(0, slot.operations.inFlightCalls - 1);
        slot.lastUsed = Date.now();
        pushBounded(slot.operations.callSamples, durationMs, MCP_OPERATION_LIMITS.LATENCY_SAMPLES);
        if (ok) {
          ctx.recordSuccess(slot);
          ctx.recordOperation(slot, 'call', 'ok', undefined, durationMs, false);
        } else {
          ctx.recordFailure(slot, 'tool', 'tool-call-failed', durationMs);
        }
      },
    }),
  );
  slot.lazyTools = wrapped;
  slot.toolSignature = signature;
  // In lazyMode tools stay unregistered until activated — but a server that IS
  // activated right now must get the fresh set, not silently lose its tools.
  const wasActive = slot.toolNames.length > 0;
  if (ctx.lazyMode && !wasActive) return;
  for (const name of slot.toolNames) {
    try {
      ctx.toolRegistry.unregister(name);
    } catch {
      /* ignore */
    }
  }
  slot.toolNames = [];
  for (const tool of wrapped) {
    try {
      ctx.toolRegistry.register(tool, `mcp:${slot.cfg.name}`);
      slot.toolNames.push(tool.name);
    } catch (err) {
      ctx.log.warn(`MCP tool "${tool.name}" not registered`, err);
    }
  }
  if (slot.lazy && !ctx.lazyMode && wrapped.length > 0) slot.registeredLazy = true;
}

export async function discoverSlotCapabilities(
  ctx: RegistryConnectContext,
  slot: ServerSlot,
  client: MCPClient,
): Promise<void> {
  const startedAt = Date.now();
  slot.serverMetadata = client.getServerMetadata();
  const capabilities = slot.serverMetadata?.capabilities;
  if (capabilities?.resources) {
    try {
      slot.resources = await collectCatalogPages(
        (cursor) => client.listResources(cursor ? { cursor } : {}),
        (page) => page.resources,
      );
    } catch (err) {
      slot.resources = undefined;
      ctx.recordFailure(slot, 'protocol', 'resource-discovery-failed');
      ctx.log.warn(`MCP server "${slot.cfg.name}" resource discovery failed`, err);
    }
    try {
      slot.resourceTemplates = await collectCatalogPages(
        (cursor) => client.listResourceTemplates(cursor ? { cursor } : {}),
        (page) => page.resourceTemplates,
      );
    } catch (err) {
      slot.resourceTemplates = undefined;
      ctx.recordFailure(slot, 'protocol', 'resource-template-discovery-failed');
      ctx.log.warn(`MCP server "${slot.cfg.name}" resource template discovery failed`, err);
    }
  } else {
    slot.resources = undefined;
    slot.resourceTemplates = undefined;
  }
  if (capabilities?.prompts) {
    try {
      slot.prompts = await collectCatalogPages(
        (cursor) => client.listPrompts(cursor ? { cursor } : {}),
        (page) => page.prompts,
      );
    } catch (err) {
      slot.prompts = undefined;
      ctx.recordFailure(slot, 'protocol', 'prompt-discovery-failed');
      ctx.log.warn(`MCP server "${slot.cfg.name}" prompt discovery failed`, err);
    }
  } else {
    slot.prompts = undefined;
  }
  const durationMs = Date.now() - startedAt;
  pushBounded(slot.operations.discoverySamples, durationMs, MCP_OPERATION_LIMITS.LATENCY_SAMPLES);
  ctx.recordOperation(slot, 'discover', 'complete', undefined, durationMs, false);
}

export async function persistSlotCapabilityManifest(
  cacheDir: string | undefined,
  slot: ServerSlot,
): Promise<void> {
  if (!slot.lazy || !cacheDir) return;
  const previous = slot.manifestWrite ?? Promise.resolve();
  const pending = previous.then(() => {
    const tools = slot.discoveredTools ?? slot.client?.listTools();
    // Nothing learned yet (no discovery, no live client): writing would
    // replace a good manifest with an empty tool list.
    if (!tools) return;
    return writeCapabilityManifest(cacheDir, slot.cfg.name, manifestConfigHash(slot.cfg), {
      tools,
      serverMetadata: slot.serverMetadata,
      resources: slot.resources,
      resourceTemplates: slot.resourceTemplates,
      prompts: slot.prompts,
    });
  });
  slot.manifestWrite = pending;
  await pending;
  if (slot.manifestWrite === pending) slot.manifestWrite = undefined;
}

export async function attemptConnectSlot(
  ctx: RegistryConnectContext,
  slot: ServerSlot,
): Promise<void> {
  const MAX_ATTEMPTS = MCP_CONSTANTS.RECONNECT.MAX_ATTEMPTS;
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    // A slot removed (forget/markDisabled) or replaced must not keep spawning.
    if (ctx.servers.get(slot.cfg.name) !== slot) {
      return;
    }
    attempt++;
    const startedAt = Date.now();
    slot.state = attempt === 1 ? 'connecting' : 'reconnecting';
    slot.attempts = attempt;
    let client: MCPClient | undefined;
    let boundDisconnect: (() => void) | undefined;
    try {
      client = new MCPClient({
        name: slot.cfg.name,
        transport: slot.cfg.transport,
        command: slot.cfg.command,
        args: slot.cfg.args,
        env: slot.cfg.env,
        url: slot.cfg.url,
        headers: slot.cfg.headers,
        startupTimeoutMs: slot.cfg.startupTimeoutMs,
        requestTimeoutMs: slot.cfg.requestTimeoutMs,
        cwd: ctx.cwd,
        allowPrivateNetworks: slot.cfg.allowPrivateNetworks,
        passthroughEnv: slot.cfg.passthroughEnv,
        authorizationProvider: ctx.authorizationProviderFactory?.(slot.cfg),
      });
      if (slot.cfg.transport === 'stdio') {
        client.addExitListener(ctx.onChildExit);
      } else {
        boundDisconnect = () => ctx.onTransportDisconnect(slot.cfg.name);
        client.addDisconnectListener(boundDisconnect);
      }
      client.addToolsChangedListener(ctx.onToolsChanged);
      ctx.addCatalogListeners(client);
      await client.connect();
      if (
        (slot.state as ConnectionState) === 'disconnected' ||
        !ctx.servers.has(slot.cfg.name) ||
        ctx.servers.get(slot.cfg.name) !== slot
      ) {
        client.removeExitListener(ctx.onChildExit);
        if (boundDisconnect) client.removeDisconnectListener(boundDisconnect);
        client.removeToolsChangedListener(ctx.onToolsChanged);
        ctx.removeCatalogListeners(client);
        await client.close().catch(() => {});
        return;
      }
      if (slot.client && slot.client !== client) {
        const prior = slot.client;
        const priorDisconnect = slot.onDisconnect;
        slot.client.removeExitListener(ctx.onChildExit);
        if (priorDisconnect) prior.removeDisconnectListener(priorDisconnect);
        prior.removeToolsChangedListener(ctx.onToolsChanged);
        ctx.removeCatalogListeners(prior);
        prior.close().catch(() => {});
      }
      slot.client = client;
      slot.onDisconnect = boundDisconnect;
      const isReconnect = slot.reconnectCycles > 0 || attempt > 1;
      slot.state = 'connected';
      slot.reconnectCycles = 0;
      const mc = client as MCPClient;
      const discovered = mc.listTools();
      // Record before persisting: the manifest must carry THIS connect's tool
      // list, not the one a dormant boot loaded from the previous cache.
      slot.discoveredTools = discovered;
      await discoverSlotCapabilities(ctx, slot, mc);
      await persistSlotCapabilityManifest(ctx.cacheDir, slot);
      applySlotTools(ctx, slot, discovered, mc);
      const durationMs = Date.now() - startedAt;
      pushBounded(
        slot.operations.connectionSamples,
        durationMs,
        MCP_OPERATION_LIMITS.LATENCY_SAMPLES,
      );
      ctx.recordSuccess(slot, (slot.operations.lastFailureAt ?? 0) < startedAt);
      ctx.recordOperation(
        slot,
        isReconnect ? 'reconnect' : 'connect',
        'connected',
        undefined,
        durationMs,
      );
      slot.lastUsed = Date.now();
      if (slot.lazy) ctx.ensureIdleSweep();
      ctx.events.emit(isReconnect ? 'mcp.server.reconnected' : 'mcp.server.connected', {
        name: slot.cfg.name,
        toolCount: slot.toolNames.length,
      });
      return;
    } catch (err) {
      ctx.recordFailure(slot, 'transport', 'connect-attempt-failed', Date.now() - startedAt);
      ctx.log.warn(`MCP server "${slot.cfg.name}" connect attempt ${attempt} failed`, err);
      if (client) {
        client.removeExitListener(ctx.onChildExit);
        if (boundDisconnect) client.removeDisconnectListener(boundDisconnect);
        client.removeToolsChangedListener(ctx.onToolsChanged);
        ctx.removeCatalogListeners(client);
        await client.close().catch(() => {});
      }
      if (attempt >= MAX_ATTEMPTS) {
        ctx.log.error(
          `MCP server "${slot.cfg.name}" connect exhausted after ${MAX_ATTEMPTS} attempts`,
          err,
        );
        slot.state = 'failed';
        slot.client = undefined;
        if (slot.reconnectTimer) {
          clearTimeout(slot.reconnectTimer);
          slot.reconnectTimer = undefined;
        }
        slot.reconnectPending = false;
        ctx.events.emit('mcp.server.disconnected', {
          name: slot.cfg.name,
          reason: err instanceof Error ? err.message : 'unknown',
        });
        return;
      }
      const delay = 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      if (
        (slot.state as ConnectionState) === 'disconnected' ||
        ctx.servers.get(slot.cfg.name) !== slot
      ) {
        return;
      }
    }
  }
}
