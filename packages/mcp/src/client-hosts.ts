import type { ClientHttpConnectionHost } from './client-http-connection.js';
import type { MCPClientInternals } from './client-internals.js';
import {
  emitCapabilityChanged,
  emitLogMessage,
  emitProgress,
  emitResourceUpdated,
} from './client-lifecycle.js';
import type { ClientStdioHost } from './client-stdio.js';
import type { ClientStdioProtocolHost } from './client-stdio-protocol.js';
import type { MCPLogMessageNotification, MCPProgressNotification } from './protocol.js';

/**
 * Host views `MCPClient` hands to the transport connectors and the stdio
 * protocol reader. Every accessor reads/writes the client's live field, so
 * the delegated code observes the same state the class does.
 */
export function buildClientHttpConnectionHost(self: MCPClientInternals): ClientHttpConnectionHost {
  return {
    opts: self.opts,
    get state() {
      return self.state;
    },
    set state(value) {
      self.state = value;
    },
    get sseTransport() {
      return self.sseTransport;
    },
    set sseTransport(value) {
      self.sseTransport = value;
    },
    disconnectListeners: self.disconnectListeners,
    get _tools() {
      return self._tools;
    },
    set _tools(value) {
      self._tools = value;
    },
    get _toolsCache() {
      return self._toolsCache;
    },
    set _toolsCache(value) {
      self._toolsCache = value;
    },
    toolsChangedListeners: self.toolsChangedListeners,
    get toolCatalogVersion() {
      return self.toolCatalogVersion;
    },
    emitCapabilityChanged: (...args) => emitCapabilityChanged(self, ...args),
    emitResourceUpdated: (uri: string) => emitResourceUpdated(self, uri),
    emitProgress: (progress: MCPProgressNotification) => emitProgress(self, progress),
    emitLogMessage: (log: MCPLogMessageNotification) => emitLogMessage(self, log),
    get _serverMetadata() {
      return self._serverMetadata;
    },
    set _serverMetadata(value) {
      self._serverMetadata = value;
    },
    get httpTransport() {
      return self.httpTransport;
    },
    set httpTransport(value) {
      self.httpTransport = value;
    },
    serverRequests: self.serverRequests,
  };
}

export function buildClientStdioHost(self: MCPClientInternals): ClientStdioHost {
  return {
    opts: self.opts,
    get state() {
      return self.state;
    },
    set state(value) {
      self.state = value;
    },
    get rxBuffer() {
      return self.rxBuffer;
    },
    set rxBuffer(value) {
      self.rxBuffer = value;
    },
    get rxBufferBytes() {
      return self.rxBufferBytes;
    },
    set rxBufferBytes(value) {
      self.rxBufferBytes = value;
    },
    get rxDecoder() {
      return self.rxDecoder;
    },
    set rxDecoder(value) {
      self.rxDecoder = value;
    },
    get child() {
      return self.child;
    },
    set child(value) {
      self.child = value;
    },
    onData: (...args) => self.onData(...args),
    onLine: (...args) => self.onLine(...args),
    failPending: (...args) => self.failPending(...args),
    exitListeners: self.exitListeners,
    request: (...args) => self.request(...args),
    serverRequests: self.serverRequests,
    get _serverMetadata() {
      return self._serverMetadata;
    },
    set _serverMetadata(value) {
      self._serverMetadata = value;
    },
    notify: (...args) => self.notify(...args),
    get toolCatalogRevision() {
      return self.toolCatalogRevision;
    },
    get _tools() {
      return self._tools;
    },
    set _tools(value) {
      self._tools = value;
    },
    get _toolsCache() {
      return self._toolsCache;
    },
    set _toolsCache(value) {
      self._toolsCache = value;
    },
    get _drainPending() {
      return self._drainPending;
    },
    set _drainPending(value) {
      self._drainPending = value;
    },
    get _lastNotifySkipped() {
      return self._lastNotifySkipped;
    },
    set _lastNotifySkipped(value) {
      self._lastNotifySkipped = value;
    },
  };
}

export function buildClientStdioProtocolHost(self: MCPClientInternals): ClientStdioProtocolHost {
  return {
    get rxBufferBytes() {
      return self.rxBufferBytes;
    },
    set rxBufferBytes(value) {
      self.rxBufferBytes = value;
    },
    get rxParts() {
      return self.rxParts;
    },
    set rxParts(value) {
      self.rxParts = value;
    },
    failPending: (...args) => self.failPending(...args),
    opts: self.opts,
    close: (...args) => self.close(...args),
    onLine: (...args) => self.onLine(...args),
    handleServerRequest: (...args) => self.handleServerRequest(...args),
    serverRequests: self.serverRequests,
    handleToolsListChanged: (...args) => self.handleToolsListChanged(...args),
    emitCapabilityChanged: (...args) => emitCapabilityChanged(self, ...args),
    emitResourceUpdated: (...args) => emitResourceUpdated(self, ...args),
    emitProgress: (...args) => emitProgress(self, ...args),
    emitLogMessage: (...args) => emitLogMessage(self, ...args),
    pending: self.pending,
  };
}
