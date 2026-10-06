import type { EventBus } from '@wrongstack/core/kernel';
import type { ToolRegistry } from '@wrongstack/core/registry';
import type { Logger, MCPServerConfig } from '@wrongstack/core/types';
import type {
  MCPAuthorizationManager,
  MCPAuthorizationStartResult,
  MCPAuthorizationStatus,
} from './authorization-manager.js';
import type { MCPClient } from './client.js';
import { MCP_CONSTANTS } from './constants.js';
import type {
  MCPInsertionPolicy,
  MCPPromptInsertion,
  MCPResourceInsertion,
} from './content-selection.js';
import type { ConnectionState, MCPTool, MCPToolAnnotations } from './contracts.js';
import type {
  MCPFailureKind,
  MCPOperationKind,
  MCPOperationListener,
  MCPServerOperationalHealth,
} from './operations.js';
import type {
  MCPGetPromptResult,
  MCPLogMessageNotification,
  MCPProgressNotification,
  MCPPrompt,
  MCPReadResourceResult,
  MCPResource,
  MCPResourceTemplate,
} from './protocol.js';
import {
  beginRegistryAuthorization,
  completeRegistryAuthorization,
  loginRegistryAuthorization,
  requireAuthorizationManager,
  requireHttpServerConfig,
} from './registry-authorization.js';
import { advanceCatalogVersion } from './registry-catalog.js';
import type { RegistryCatalogOperationsHost } from './registry-catalog-operations.js';
import {
  getCatalog as getCatalogFromHost,
  getPrompt as getPromptFromHost,
  listPrompts as listPromptsFromHost,
  listResources as listResourcesFromHost,
  listResourceTemplates as listResourceTemplatesFromHost,
  readResource as readResourceFromHost,
  selectPromptForInsertion as selectPromptForInsertionFromHost,
  selectResourceForInsertion as selectResourceForInsertionFromHost,
  subscribeResource as subscribeResourceFromHost,
  unsubscribeResource as unsubscribeResourceFromHost,
} from './registry-catalog-operations.js';
import {
  applySlotTools,
  attemptConnectSlot,
  persistSlotCapabilityManifest,
  type RegistryConnectContext,
} from './registry-connect-loop.js';
import { markLazySlotDormant, resetDisconnectedSlotTools } from './registry-disconnect.js';
import { buildRegistryOperationalHealth } from './registry-health.js';
import { type RegistryIdleContext, sweepIdleSlots } from './registry-idle.js';
import {
  recordRegistryFailure,
  recordRegistryOperation,
  recordRegistrySuccess,
} from './registry-operations.js';
import { scheduleRegistryReconnect } from './registry-reconnect.js';
import {
  activateServer as activateServerFromHost,
  deactivateServer as deactivateServerFromHost,
  ensureConnected as ensureConnectedFromHost,
  type RegistryServerLifecycleHost,
  restart as restartFromHost,
  singleFlightConnect as singleFlightConnectFromHost,
  sleep as sleepFromHost,
  start as startFromHost,
  startLazy as startLazyFromHost,
  stop as stopFromHost,
} from './registry-server-lifecycle.js';
import type { ServerSlot } from './registry-slots.js';
import type { MCPRegistryCatalog, MCPRegistryOptions } from './registry-types.js';

export type { MCPRegistryCatalog, MCPRegistryOptions } from './registry-types.js';

export class MCPRegistry {
  private readonly servers = new Map<string, ServerSlot>();
  /** Configured-off servers are tracked without creating a transport/client. */
  private readonly disabledServers = new Map<string, MCPServerConfig>();
  private readonly toolRegistry: ToolRegistry;
  private readonly events: EventBus;
  private readonly log: Logger;
  private readonly lazyMode: boolean;
  private readonly cacheDir?: string | undefined;
  private readonly cwd?: string | undefined;
  private readonly idleTimeoutMs: number;
  private readonly authorizationProviderFactory?: MCPRegistryOptions['authorizationProviderFactory'];
  private readonly authorizationManager?: MCPAuthorizationManager | undefined;
  private readonly elicitationHandler?: MCPRegistryOptions['elicitationHandler'];
  private readonly operationListeners = new Set<MCPOperationListener>();
  /** Starts still in flight, for {@link whenStarted}. */
  private readonly startups = new Set<Promise<void>>();
  /** Single shared idle sweep timer (started lazily; unref'd; cleared on stopAll). */
  private idleTimer?: ReturnType<typeof setInterval> | undefined;

  constructor(opts: MCPRegistryOptions) {
    this.toolRegistry = opts.toolRegistry;
    this.events = opts.events;
    this.log = opts.log;
    this.lazyMode = opts.lazyMode ?? false;
    this.cacheDir = opts.cacheDir;
    this.cwd = opts.cwd;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? MCP_CONSTANTS.IDLE.DEFAULT_TIMEOUT_MS;
    this.authorizationProviderFactory = opts.authorizationProviderFactory;
    this.authorizationManager = opts.authorizationManager;
    this.elicitationHandler = opts.elicitationHandler;
  }

  private requireSlot(name: string): ServerSlot {
    const slot = this.servers.get(name);
    if (!slot) throw new Error(`MCP server "${name}" not registered`);
    return slot;
  }

  async loginAuthorization(
    name: string,
    input: Omit<
      import('./authorization-manager.js').MCPAuthorizationLoginInput,
      'serverName' | 'resource'
    >,
  ): Promise<import('./authorization-manager.js').MCPAuthorizationLoginHandle> {
    const cfg = this.requireHttpServerConfig(name);
    return loginRegistryAuthorization(this.authorizationManager, cfg, name, input);
  }

  async beginAuthorization(
    name: string,
    input: {
      clientId?: string | undefined;
      redirectUri: string;
      scopes?: readonly string[] | undefined;
      challengeHeader?: string | null | undefined;
      signal?: AbortSignal | undefined;
    },
  ): Promise<MCPAuthorizationStartResult> {
    const cfg = this.requireHttpServerConfig(name);
    return beginRegistryAuthorization(this.authorizationManager, cfg, name, input);
  }

  async completeAuthorization(
    name: string,
    callbackUrl: string,
    signal?: AbortSignal | undefined,
  ): Promise<MCPAuthorizationStatus> {
    const cfg = this.requireHttpServerConfig(name);
    return completeRegistryAuthorization(this.authorizationManager, cfg, name, callbackUrl, signal);
  }

  async authorizationStatus(name: string): Promise<MCPAuthorizationStatus> {
    const manager = requireAuthorizationManager(this.authorizationManager);
    const cfg = this.requireHttpServerConfig(name);
    return manager.status(name, cfg.url!);
  }

  async disconnectAuthorization(name: string): Promise<boolean> {
    const manager = requireAuthorizationManager(this.authorizationManager);
    const cfg = this.requireHttpServerConfig(name);
    return manager.disconnect(name, cfg.url!);
  }

  private requireHttpServerConfig(name: string): MCPServerConfig {
    return requireHttpServerConfig(this.servers, this.disabledServers, name);
  }

  async start(cfg: MCPServerConfig): Promise<void> {
    return startFromHost(this.registryServerLifecycleHost(), cfg);
  }

  /**
   * Resolves once every start already in flight has connected or failed. A
   * host that starts its servers in the background and then runs a single
   * turn waits here, so the turn's tool list includes theirs.
   */
  async whenStarted(): Promise<void> {
    while (this.startups.size > 0) await Promise.all([...this.startups]);
  }

  /** Record an intentionally disabled configuration without opening a transport. */
  markDisabled(cfg: MCPServerConfig): void {
    this.servers.delete(cfg.name);
    this.disabledServers.set(cfg.name, { ...cfg, enabled: false });
  }

  /** Remove residual operational/configuration state after a management delete. */
  forget(name: string): void {
    this.servers.delete(name);
    this.disabledServers.delete(name);
  }

  /**
   * Boot a lazy server WITHOUT spawning it. If a tool manifest is cached (from a
   * prior connect with matching config), register resolver-backed wrappers and
   * go `dormant` — the process spawns on the first tool call. If there is no
   * cache yet, do a one-time cold discovery connect to learn + cache the tools.
   */
  private async startLazy(slot: ServerSlot): Promise<void> {
    return startLazyFromHost(this.registryServerLifecycleHost(), slot);
  }

  private singleFlightConnect(slot: ServerSlot): Promise<MCPClient | undefined> {
    return singleFlightConnectFromHost(this.registryServerLifecycleHost(), slot);
  }

  /**
   * Ensure a lazy server is connected, spawning it on demand. Single-flight:
   * concurrent first-calls share one connect. Resolver wrappers call this.
   */
  async ensureConnected(name: string): Promise<MCPClient> {
    return ensureConnectedFromHost(this.registryServerLifecycleHost(), name);
  }

  /**
   * Register all cached tools for a given server into the tool registry.
   * No-op if tools are already registered or the server is not connected.
   * The server connection stays alive — this only toggles tool visibility.
   */
  activateServer(name: string): void {
    activateServerFromHost(this.registryServerLifecycleHost(), name);
  }

  /**
   * Unregister all tools for a given server from the tool registry.
   * The server connection stays alive — this only toggles tool visibility.
   * Returns the number of tools that were deactivated.
   */
  deactivateServer(name: string): number {
    return deactivateServerFromHost(this.registryServerLifecycleHost(), name);
  }

  /**
   * The tools a server offers — bare names, descriptions and input schemas —
   * without activating, registering or waking it. In token-saving mode the
   * model reaches MCP only through `mcp_use`, which needs the bare tool name
   * and its input shape; before this there was no way to learn either short
   * of guessing and reading the error. Honors `allowedTools`. Returns
   * `undefined` for an unknown server, `[]` when nothing was discovered yet.
   */
  describeTools(
    name: string,
  ):
    | {
        name: string;
        description?: string | undefined;
        inputSchema: Record<string, unknown>;
        annotations?: MCPToolAnnotations | undefined;
      }[]
    | undefined {
    const slot = this.servers.get(name);
    if (!slot) return undefined;
    const allowed = slot.cfg.allowedTools;
    const tools = slot.discoveredTools ?? slot.client?.listTools() ?? [];
    return tools
      .filter((tool) => !allowed || allowed.includes(tool.name))
      .map((tool) => ({
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        inputSchema: structuredClone(tool.inputSchema),
        // Behaviour hints the SERVER claimed (already sanitized to the five
        // known keys by normalizeMCPTools). Surfaced for the operator only:
        // nothing in the permission path reads this field.
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }));
  }

  /**
   * Check whether a server's tools are currently registered.
   */
  isActivated(name: string): boolean {
    const slot = this.servers.get(name);
    return slot ? slot.toolNames.length > 0 : false;
  }

  async stop(name: string): Promise<void> {
    return stopFromHost(this.registryServerLifecycleHost(), name);
  }

  /**
   * Stop and start a registered server. Pass `nextCfg` to apply an edited
   * configuration: without it the slot reconnects with the config it was
   * started with, so an update/enable routed through restart() silently kept
   * the old command, url, env, permission and lazy flag until the next boot.
   */
  /**
   * Put a running server to sleep while keeping its configuration enabled.
   *
   * A lazy server goes `dormant`: the process stops but its tools stay
   * registered and the next call wakes it. Surfaces previously used stop() for
   * this, which unregistered a lazy server's tools — "sleep" silently became
   * "unreachable until restarted". Eager servers have no dormant state, so
   * for them sleep is a stop.
   */
  async sleep(name: string): Promise<void> {
    return sleepFromHost(this.registryServerLifecycleHost(), name);
  }

  async restart(name: string, nextCfg?: MCPServerConfig | undefined): Promise<void> {
    return restartFromHost(this.registryServerLifecycleHost(), name, nextCfg);
  }

  list(): { name: string; state: ConnectionState; toolCount: number; tools: string[] }[] {
    return Array.from(this.servers.values()).map((s) => {
      const tools = this.toolNamesForSlot(s);
      return {
        name: s.cfg.name,
        state: s.state,
        toolCount: tools.length,
        tools,
      };
    });
  }

  /**
   * Subscribe to payload-free operational signals. Callers must still avoid
   * using `serverName` as an unbounded metric label.
   */
  onOperation(listener: MCPOperationListener): () => void {
    this.operationListeners.add(listener);
    return () => this.operationListeners.delete(listener);
  }

  /** Detailed, defensively-copied operational snapshots for CLI/WebUI/HQ. */
  operationalHealth(): MCPServerOperationalHealth[] {
    return buildRegistryOperationalHealth(this.servers.values(), this.disabledServers.values());
  }

  getCatalog(name: string): MCPRegistryCatalog | undefined {
    return getCatalogFromHost.call(this.registryCatalogOperationsHost(), name);
  }

  async listResources(name: string, opts: { refresh?: boolean } = {}): Promise<MCPResource[]> {
    return listResourcesFromHost.call(this.registryCatalogOperationsHost(), name, opts);
  }

  async listResourceTemplates(
    name: string,
    opts: { refresh?: boolean } = {},
  ): Promise<MCPResourceTemplate[]> {
    return listResourceTemplatesFromHost.call(this.registryCatalogOperationsHost(), name, opts);
  }

  async readResource(name: string, uri: string): Promise<MCPReadResourceResult> {
    return readResourceFromHost.call(this.registryCatalogOperationsHost(), name, uri);
  }

  async selectResourceForInsertion(
    name: string,
    uri: string,
    policy?: MCPInsertionPolicy | undefined,
  ): Promise<MCPResourceInsertion> {
    return selectResourceForInsertionFromHost.call(
      this.registryCatalogOperationsHost(),
      name,
      uri,
      policy,
    );
  }

  async subscribeResource(name: string, uri: string): Promise<void> {
    return subscribeResourceFromHost.call(this.registryCatalogOperationsHost(), name, uri);
  }

  async unsubscribeResource(name: string, uri: string): Promise<void> {
    return unsubscribeResourceFromHost.call(this.registryCatalogOperationsHost(), name, uri);
  }

  async listPrompts(name: string, opts: { refresh?: boolean } = {}): Promise<MCPPrompt[]> {
    return listPromptsFromHost.call(this.registryCatalogOperationsHost(), name, opts);
  }

  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string> | undefined,
  ): Promise<MCPGetPromptResult> {
    return getPromptFromHost.call(
      this.registryCatalogOperationsHost(),
      serverName,
      promptName,
      args,
    );
  }

  /** Keep all remote requests awake and reject results from superseded clients. */
  private async withConnectedClient<T>(
    name: string,
    run: (client: MCPClient, assertCurrent: () => void) => Promise<T>,
  ): Promise<T> {
    const slot = this.requireSlot(name);
    const generation = slot.startupGeneration;
    slot.operations.inFlightCalls++;
    slot.operations.peakInFlightCalls = Math.max(
      slot.operations.peakInFlightCalls,
      slot.operations.inFlightCalls,
    );
    try {
      const client = await this.ensureConnected(name);
      const assertCurrent = () => {
        if (
          this.servers.get(name) !== slot ||
          slot.startupGeneration !== generation ||
          slot.client !== client ||
          slot.state !== 'connected'
        ) {
          throw new Error(`MCP server "${name}" connection changed during request`);
        }
      };
      assertCurrent();
      const result = await run(client, assertCurrent);
      assertCurrent();
      return result;
    } finally {
      slot.operations.inFlightCalls = Math.max(0, slot.operations.inFlightCalls - 1);
      if (slot.startupGeneration === generation) slot.lastUsed = Date.now();
    }
  }

  async selectPromptForInsertion(
    serverName: string,
    promptName: string,
    args?: Record<string, string> | undefined,
    policy?: MCPInsertionPolicy | undefined,
  ): Promise<MCPPromptInsertion> {
    return selectPromptForInsertionFromHost.call(
      this.registryCatalogOperationsHost(),
      serverName,
      promptName,
      args,
      policy,
    );
  }

  /**
   * Resolve the live tool names for a slot — the registered names in normal
   * mode, or the cached lazy-tool names when running in lazy mode (where
   * tools are connected but intentionally not registered).
   */
  private toolNamesForSlot(s: ServerSlot): string[] {
    return s.toolNames.length > 0 ? s.toolNames.slice() : (s.lazyTools ?? []).map((t) => t.name);
  }

  private connectContext(): RegistryConnectContext {
    return {
      servers: this.servers,
      toolRegistry: this.toolRegistry,
      events: this.events,
      log: this.log,
      lazyMode: this.lazyMode,
      cacheDir: this.cacheDir,
      cwd: this.cwd,
      authorizationProviderFactory: this.authorizationProviderFactory,
      elicitationHandler: this.elicitationHandler,
      operationListeners: this.operationListeners,
      ensureConnected: (name) => this.ensureConnected(name),
      recordOperation: (slot, kind, reason, failureKind, durationMs, retain) =>
        this.recordOperation(slot, kind, reason, failureKind, durationMs, retain),
      recordSuccess: (slot, resetFailures) => this.recordSuccess(slot, resetFailures),
      recordFailure: (slot, failureKind, reason, durationMs) =>
        this.recordFailure(slot, failureKind, reason, durationMs),
      onChildExit: this.onChildExit,
      onTransportDisconnect: this.onTransportDisconnect,
      onToolsChanged: this.onToolsChanged,
      addCatalogListeners: (client) => this.addCatalogListeners(client),
      removeCatalogListeners: (client) => this.removeCatalogListeners(client),
      ensureIdleSweep: () => this.ensureIdleSweep(),
    };
  }

  private idleContext(): RegistryIdleContext {
    return {
      servers: this.servers,
      idleTimeoutMs: this.idleTimeoutMs,
      events: this.events,
      log: this.log,
      recordOperation: (slot, kind, reason) => this.recordOperation(slot, kind, reason),
      onChildExit: this.onChildExit,
      onToolsChanged: this.onToolsChanged,
      removeCatalogListeners: (client) => this.removeCatalogListeners(client),
    };
  }

  private applyTools(slot: ServerSlot, tools: MCPTool[], client?: MCPClient | undefined): void {
    applySlotTools(this.connectContext(), slot, tools, client);
  }

  private async persistCapabilityManifest(slot: ServerSlot): Promise<void> {
    return persistSlotCapabilityManifest(this.cacheDir, slot);
  }

  /** Start the shared idle sweep timer once (unref'd so it never holds the process). */
  private ensureIdleSweep(): void {
    if (this.idleTimer || this.idleTimeoutMs <= 0) return;
    this.idleTimer = setInterval(() => {
      void this.sweepIdle();
    }, MCP_CONSTANTS.IDLE.SWEEP_INTERVAL_MS);
    this.idleTimer.unref?.();
  }

  private async sweepIdle(): Promise<void> {
    if (this.idleTimeoutMs <= 0) return;
    const hasConnectedLazy = await sweepIdleSlots(this.idleContext());
    if (!hasConnectedLazy && this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /**
   * Catalog of every server ever registered with this registry — includes
   * servers that are stopped, failed, or not yet started.
   * Useful for the `mcp_control` tool to show all known servers without
   * triggering connections.
   */
  describe(): {
    name: string;
    state: ConnectionState;
    toolCount: number;
    enabled: boolean;
    tools: string[];
  }[] {
    const active = Array.from(this.servers.values()).map((s) => {
      const tools = this.toolNamesForSlot(s);
      return {
        name: s.cfg.name,
        state: s.state,
        toolCount: tools.length,
        enabled: s.cfg.enabled !== false,
        tools,
      };
    });
    const disabled = Array.from(this.disabledServers.values()).map((cfg) => ({
      name: cfg.name,
      state: 'idle' as const,
      toolCount: 0,
      enabled: false,
      tools: [],
    }));
    return [...active, ...disabled];
  }

  async stopAll(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
    const names = Array.from(this.servers.keys());
    await Promise.all(
      names.map(async (name) => {
        try {
          await this.stop(name);
        } catch (err) {
          this.log.warn(`MCP server "${name}" failed to stop during stopAll`, err);
        }
      }),
    );
    this.disabledServers.clear();
  }

  /**
   * Health check — returns 'ok' for connected servers, the current state otherwise.
   * For HTTP-based transports this could also ping the server.
   */
  health(): { name: string; alive: boolean; latencyMs?: number | undefined }[] {
    return Array.from(this.servers.values()).map((s) => ({
      name: s.cfg.name,
      alive: s.state === 'connected',
    }));
  }

  /**
   * L2-C: handle `notifications/tools/list_changed` from the server.
   * Unregister the previous wrapper set, then re-register the fresh
   * tool list. The client has already refreshed its cache before
   * dispatching — we just need to re-wrap and re-register.
   * In lazy mode, only update the internal cache without registering.
   */
  private readonly onToolsChanged = (name: string, _tools: { name: string }[]): void => {
    const slot = this.servers.get(name);
    if (!slot?.client) return;
    // applyTools swaps the registered set itself (and keeps an lazyMode
    // activation alive). No connection event: the connection did not change.
    const discovered = slot.client.listTools();
    this.applyTools(slot, discovered, slot.client);
    // Refresh the lazy manifest so a future cold boot sees the new tool set.
    void this.persistCapabilityManifest(slot);
    this.log.info(
      `MCP server "${slot.cfg.name}" tools refreshed (${this.toolNamesForSlot(slot).length} active)`,
    );
  };

  private readonly onResourcesChanged = (name: string): void => {
    const slot = this.servers.get(name);
    if (!slot) return;
    advanceCatalogVersion(slot, 'resources');
    advanceCatalogVersion(slot, 'resourceTemplates');
    slot.resources = undefined;
    slot.resourceTemplates = undefined;
    void this.persistCapabilityManifest(slot);
    this.log.info(`MCP server "${name}" resource catalog invalidated`);
  };

  private readonly onResourceUpdated = (name: string, uri: string): void => {
    if (!this.servers.has(name)) return;
    // A subscription is live data, not a catalog change: the list is still
    // valid, so nothing is invalidated. Surfaces that asked to subscribe get
    // the event; everyone else ignores it.
    this.events.emit('mcp.resource.updated', { name, uri });
  };

  private readonly onProgress = (name: string, progress: MCPProgressNotification): void => {
    if (!this.servers.has(name)) return;
    // Display-only telemetry for a long-running call; the payload is already
    // clamped/sanitized by the parser (attacker-controllable server output).
    this.events.emit('mcp.progress', { name, ...progress });
  };

  private readonly onLogMessage = (name: string, log: MCPLogMessageNotification): void => {
    if (!this.servers.has(name)) return;
    // Display-only server log line. Never consulted by permission, sandbox,
    // or tool-call decisions.
    this.events.emit('mcp.log', { name, ...log });
  };

  private readonly onPromptsChanged = (name: string): void => {
    const slot = this.servers.get(name);
    if (!slot) return;
    advanceCatalogVersion(slot, 'prompts');
    slot.prompts = undefined;
    void this.persistCapabilityManifest(slot);
    this.log.info(`MCP server "${name}" prompt catalog invalidated`);
  };

  private addCatalogListeners(client: MCPClient): void {
    client.addResourcesChangedListener(this.onResourcesChanged);
    client.addPromptsChangedListener(this.onPromptsChanged);
    client.addResourceUpdatedListener?.(this.onResourceUpdated);
    client.addProgressListener?.(this.onProgress);
    client.addLogMessageListener?.(this.onLogMessage);
  }

  private removeCatalogListeners(client: MCPClient): void {
    client.removeResourcesChangedListener?.(this.onResourcesChanged);
    client.removePromptsChangedListener?.(this.onPromptsChanged);
    client.removeResourceUpdatedListener?.(this.onResourceUpdated);
    client.removeProgressListener?.(this.onProgress);
    client.removeLogMessageListener?.(this.onLogMessage);
  }

  private readonly onChildExit = (
    name: string,
    code: number | null,
    _signal: string | null,
  ): void => {
    const slot = this.servers.get(name);
    // Only the death of a LIVE connection is a disconnect. A client that fails
    // mid-handshake closes (and exits) with its listeners still attached; the
    // connect loop already owns that failure, and treating it here as well
    // scheduled a second, concurrent reconnect and made the loop abandon its
    // remaining attempts (it read the flipped 'disconnected' as a stop()).
    if (slot?.state !== 'connected') return;
    if (slot.lazy) {
      this.recordFailure(slot, 'transport', 'process-exit-lazy');
      markLazySlotDormant(slot, this.events, `exit:${code ?? 'unknown'}`, {
        onChildExit: this.onChildExit,
        onToolsChanged: this.onToolsChanged,
        removeCatalogListeners: (c) => this.removeCatalogListeners(c),
      });
      return;
    }
    resetDisconnectedSlotTools(slot, this.toolRegistry);
    slot.state = 'disconnected';
    this.recordFailure(slot, 'transport', 'process-exit');
    this.events.emit('mcp.server.disconnected', { name, reason: `exit:${code ?? 'unknown'}` });
    this.scheduleReconnect(slot);
  };

  /** Handles SSE / streamable-http disconnect — same recovery as stdio child exit. */
  private readonly onTransportDisconnect = (name: string): void => {
    const slot = this.servers.get(name);
    // Same live-connection guard as onChildExit.
    if (slot?.state !== 'connected') return;
    if (slot.lazy) {
      this.recordFailure(slot, 'transport', 'http-disconnect-lazy');
      markLazySlotDormant(slot, this.events, 'http-disconnect', {
        onChildExit: this.onChildExit,
        onToolsChanged: this.onToolsChanged,
        removeCatalogListeners: (c) => this.removeCatalogListeners(c),
      });
      return;
    }
    resetDisconnectedSlotTools(slot, this.toolRegistry);
    slot.state = 'disconnected';
    this.recordFailure(slot, 'transport', 'http-disconnect');
    this.events.emit('mcp.server.disconnected', { name, reason: 'http-disconnect' });
    this.scheduleReconnect(slot);
  };

  private static readonly MAX_RECONNECT_CYCLES = MCP_CONSTANTS.RECONNECT.MAX_CYCLES;
  private static readonly BASE_RECONNECT_DELAY_MS = MCP_CONSTANTS.RECONNECT.BASE_DELAY_MS;
  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;

  private scheduleReconnect(slot: ServerSlot): void {
    scheduleRegistryReconnect({
      slot,
      events: this.events,
      log: this.log,
      maxReconnectCycles: MCPRegistry.MAX_RECONNECT_CYCLES,
      baseReconnectDelayMs: MCPRegistry.BASE_RECONNECT_DELAY_MS,
      maxReconnectDelayMs: MCPRegistry.MAX_RECONNECT_DELAY_MS,
      recordReconnectExhausted: (target) =>
        this.recordFailure(target, 'transport', 'reconnect-exhausted'),
      attemptReconnect: (target) => this.attemptReconnect(target),
    });
  }

  private async attemptReconnect(slot: ServerSlot): Promise<void> {
    slot.reconnectPending = false;
    slot.reconnectCycles++;
    slot.operations.reconnectCount++;
    this.recordOperation(slot, 'reconnect', 'automatic');
    // Through the single-flight gate: a tool call waking the slot at the same
    // moment must share this connect, not spawn a second process.
    await this.singleFlightConnect(slot);
  }

  private recordSuccess(slot: ServerSlot, resetFailures = true): void {
    recordRegistrySuccess(slot, resetFailures);
  }

  private recordFailure(
    slot: ServerSlot,
    failureKind: MCPFailureKind,
    reason: string,
    durationMs?: number | undefined,
  ): void {
    recordRegistryFailure(slot, this.operationListeners, failureKind, reason, durationMs);
  }

  private recordOperation(
    slot: ServerSlot,
    kind: MCPOperationKind,
    reason?: string | undefined,
    failureKind?: MCPFailureKind | undefined,
    durationMs?: number | undefined,
    retain = true,
  ): void {
    recordRegistryOperation(
      slot,
      this.operationListeners,
      kind,
      reason,
      failureKind,
      durationMs,
      retain,
    );
  }

  private async attemptConnect(slot: ServerSlot): Promise<void> {
    return attemptConnectSlot(this.connectContext(), slot);
  }

  private registryCatalogOperationsHost(): RegistryCatalogOperationsHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.servers satisfies RegistryCatalogOperationsHost['servers']);
    void (this.disabledServers satisfies RegistryCatalogOperationsHost['disabledServers']);
    void (this.requireSlot satisfies RegistryCatalogOperationsHost['requireSlot']);
    void (this.withConnectedClient satisfies RegistryCatalogOperationsHost['withConnectedClient']);
    void (this
      .persistCapabilityManifest satisfies RegistryCatalogOperationsHost['persistCapabilityManifest']);
    void (this.readResource satisfies RegistryCatalogOperationsHost['readResource']);
    void (this.getPrompt satisfies RegistryCatalogOperationsHost['getPrompt']);
    return this as unknown as RegistryCatalogOperationsHost;
  }

  private registryServerLifecycleHost(): RegistryServerLifecycleHost {
    // Check the complete helper contract while preserving the owner's identity and receivers.
    void ({
      servers: this.servers,
      stop: this.stop,
      markDisabled: this.markDisabled,
      disabledServers: this.disabledServers,
      cacheDir: this.cacheDir,
      startLazy: this.startLazy,
      singleFlightConnect: this.singleFlightConnect,
      startups: this.startups,
      applyTools: this.applyTools,
      ensureIdleSweep: this.ensureIdleSweep,
      log: this.log,
      attemptConnect: this.attemptConnect,
      recordOperation: this.recordOperation,
      toolRegistry: this.toolRegistry,
      onChildExit: this.onChildExit,
      onToolsChanged: this.onToolsChanged,
      removeCatalogListeners: this.removeCatalogListeners,
      events: this.events,
      requireSlot: this.requireSlot,
      idleContext: this.idleContext,
    } satisfies RegistryServerLifecycleHost);
    return this as unknown as RegistryServerLifecycleHost;
  }
}
