import type { RegistryConnectContext } from './registry-connect-loop.js';
import type { RegistryIdleContext } from './registry-idle.js';
import type { MCPRegistryInternals } from './registry-internals.js';

/**
 * The context objects `MCPRegistry` hands to the connect loop and the idle
 * sweep. Every callback dispatches through the registry instance, so a
 * replaced/spied member is honored exactly as when the class built them.
 */
export function buildRegistryConnectContext(self: MCPRegistryInternals): RegistryConnectContext {
  return {
    servers: self.servers,
    toolRegistry: self.toolRegistry,
    events: self.events,
    log: self.log,
    lazyMode: self.lazyMode,
    cacheDir: self.cacheDir,
    cwd: self.cwd,
    authorizationProviderFactory: self.authorizationProviderFactory,
    elicitationHandler: self.elicitationHandler,
    operationListeners: self.operationListeners,
    ensureConnected: (name) => self.ensureConnected(name),
    recordOperation: (slot, kind, reason, failureKind, durationMs, retain) =>
      self.recordOperation(slot, kind, reason, failureKind, durationMs, retain),
    recordSuccess: (slot, resetFailures) => self.recordSuccess(slot, resetFailures),
    recordFailure: (slot, failureKind, reason, durationMs) =>
      self.recordFailure(slot, failureKind, reason, durationMs),
    onChildExit: self.onChildExit,
    onTransportDisconnect: self.onTransportDisconnect,
    onToolsChanged: self.onToolsChanged,
    addCatalogListeners: (client) => self.addCatalogListeners(client),
    removeCatalogListeners: (client) => self.removeCatalogListeners(client),
    ensureIdleSweep: () => self.ensureIdleSweep(),
  };
}

export function buildRegistryIdleContext(self: MCPRegistryInternals): RegistryIdleContext {
  return {
    servers: self.servers,
    idleTimeoutMs: self.idleTimeoutMs,
    events: self.events,
    log: self.log,
    recordOperation: (slot, kind, reason) => self.recordOperation(slot, kind, reason),
    onChildExit: self.onChildExit,
    onToolsChanged: self.onToolsChanged,
    removeCatalogListeners: (client) => self.removeCatalogListeners(client),
  };
}
