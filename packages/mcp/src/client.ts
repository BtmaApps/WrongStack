import type { ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { MCPCapabilityClient } from './client-capabilities.js';
import {
  type ClientHttpConnectionHost,
  connectSSE as delegateConnectSSE,
  connectStreamableHTTP as delegateConnectStreamableHTTP,
} from './client-http-connection.js';
import { forceKillTree } from './client-process.js';
import { type ClientStdioHost, connectStdio, notifyStdio } from './client-stdio.js';
import {
  type ClientStdioProtocolHost,
  receiveStdioData,
  receiveStdioLine,
} from './client-stdio-protocol.js';
import type {
  ExitListener,
  JsonRpcRequest,
  JsonRpcServerRequest,
  MCPClientOptions,
  MCPListChangedListener,
  MCPPageOptions,
  MCPRequestOptions,
  MCPResourceUpdatedListener,
  ToolsChangedListener,
} from './client-types.js';
import type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult } from './contracts.js';
import { ServerRequestResponder, type UrlElicitation } from './elicitation.js';
import type {
  MCPGetPromptResult,
  MCPListPromptsResult,
  MCPListResourcesResult,
  MCPListResourceTemplatesResult,
  MCPReadResourceResult,
  MCPServerMetadata,
} from './protocol.js';
import { listAllTools, toToolCallResult } from './tool-schema.js';
import type { SSETransport, StreamableHTTPTransport } from './transport.js';
import { nextJsonRpcId } from './transport-base.js';

export { forceKillTree } from './client-process.js';

export { quoteWindowsArg } from './client-protocol-helpers.js';

export type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult };

export class MCPClient {
  private readonly capabilityClient = new MCPCapabilityClient(
    this.requestCapability.bind(this),
    this.requireResourceSubscriptions.bind(this),
  );

  private state: ConnectionState = 'idle';
  private child?: ChildProcess | undefined;
  private nextId = 1;
  /**
   * In-flight JSON-RPC calls keyed by id. `resolve` settles the call; `reject`
   * is invoked from {@link failPending} when the underlying transport dies
   * (stdio child exit, `close()`) so callers don't hang forever.
   */
  private readonly pending = new Map<
    number,
    { resolve: (res: JsonRpcResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  /**
   * The unterminated tail of stdout, as the chunks it arrived in; joined only
   * when its newline arrives. Kept as one string (`+=` then `indexOf`), every
   * chunk flattened and re-scanned everything buffered so far — O(n²) for a
   * multi-MiB tools/call result.
   */
  private rxParts: string[] = [];
  private get rxBuffer(): string {
    return this.rxParts.join('');
  }
  private set rxBuffer(value: string) {
    this.rxParts = value ? [value] : [];
  }
  private rxBufferBytes = 0;
  /**
   * Incremental UTF-8 decoder for the stdio rx path. A pipe read boundary can
   * land inside a multi-byte sequence; decoding each chunk with
   * `chunk.toString()` would replace it with U+FFFD and silently corrupt the
   * JSON-RPC payload. StringDecoder withholds the partial sequence until the
   * chunk that completes it (same remedy as `readFileHead` in core utils).
   */
  private rxDecoder = new StringDecoder('utf8');
  private _tools: MCPTool[] = [];
  /** Server-declared handshake metadata. Populated for stdio in the first protocol slice. */
  private _serverMetadata?: MCPServerMetadata | undefined;
  /** Cached tool list — survives reconnects so the registry can re-register without re-discovering. */
  private _toolsCache?: MCPTool[] | undefined;
  private _drainPending = false;
  private _lastNotifySkipped = false;
  private closePromise?: Promise<void> | undefined;
  private connectPromise?: Promise<void> | undefined;
  private toolCatalogVersion = 0;
  private toolCatalogRevision = 0;
  // HTTP transports
  private sseTransport?: SSETransport | undefined;
  private httpTransport?: StreamableHTTPTransport | undefined;
  /** Notified when the stdio child process exits so the registry can attempt reconnect. */
  private readonly exitListeners = new Set<ExitListener>();
  /** Notified when the server announces a tools/list_changed notification. */
  private readonly toolsChangedListeners = new Set<ToolsChangedListener>();
  private readonly resourcesChangedListeners = new Set<MCPListChangedListener>();
  private readonly promptsChangedListeners = new Set<MCPListChangedListener>();
  private readonly resourceUpdatedListeners = new Set<MCPResourceUpdatedListener>();
  /** Notified when an HTTP transport (SSE or streamable-http) disconnects. */
  private readonly disconnectListeners = new Set<() => void>();
  /** Answers server→client requests (ping, elicitation) on every transport. */
  private readonly serverRequests: ServerRequestResponder;

  constructor(public readonly opts: MCPClientOptions) {
    this.serverRequests = new ServerRequestResponder(opts.elicitation);
  }

  getState(): ConnectionState {
    return this.state;
  }

  getServerMetadata(): MCPServerMetadata | undefined {
    const metadata = this._serverMetadata;
    if (!metadata) return undefined;
    return {
      ...metadata,
      capabilities: { ...metadata.capabilities },
      serverInfo: { ...metadata.serverInfo },
    };
  }

  listTools(): MCPTool[] {
    return this._tools.length > 0
      ? [...this._tools]
      : this._toolsCache
        ? [...this._toolsCache]
        : [];
  }

  /** Returns true if a prior notify() call was skipped due to backpressure. */
  hadNotifySkipped(): boolean {
    return this._lastNotifySkipped;
  }

  /**
   * Register a listener for child-process exit events.
   * The registry uses this to trigger reconnection.
   */
  addExitListener(listener: ExitListener): void {
    this.exitListeners.add(listener);
  }

  removeExitListener(listener: ExitListener): void {
    this.exitListeners.delete(listener);
  }

  /**
   * Register a listener for transport disconnect events (SSE / streamable-http).
   * Used by the registry to trigger reconnection for HTTP-based servers.
   */
  addDisconnectListener(listener: () => void): void {
    this.disconnectListeners.add(listener);
  }

  removeDisconnectListener(listener: () => void): void {
    this.disconnectListeners.delete(listener);
  }

  async connect(): Promise<void> {
    // Idempotent: a second connect() on an already-connected or connecting
    // client must not spawn a second server process. close() tears down only
    // the latest child, so the overwritten one would be orphaned — and when
    // it later exits, its handler flips `state` to 'disconnected' under the
    // healthy replacement connection, tripping spurious reconnects. Callers
    // that want a fresh connection call close() first.
    if (this.state === 'connected') return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInner().finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async connectInner(): Promise<void> {
    this.toolCatalogVersion++;
    this.state = 'connecting';
    this._serverMetadata = undefined;

    try {
      if (this.opts.transport === 'stdio') {
        await this.connectStdio();
      } else if (this.opts.transport === 'sse') {
        await this.connectSSE();
      } else if (this.opts.transport === 'streamable-http') {
        await this.connectStreamableHTTP();
      } else {
        throw new Error(`Unknown transport "${this.opts.transport}"`);
      }
    } catch (err) {
      await this.close().catch(() => {});
      this.state = 'failed';
      throw err;
    }
  }

  private async connectStdio(): Promise<void> {
    return connectStdio(this.clientStdioHost());
  }

  private async connectSSE(): Promise<void> {
    return delegateConnectSSE(this.clientHttpConnectionHost());
  }

  private async connectStreamableHTTP(): Promise<void> {
    return delegateConnectStreamableHTTP(this.clientHttpConnectionHost());
  }

  async callTool(
    name: string,
    input: unknown,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<ToolCallResult> {
    if (this.state !== 'connected') {
      throw new Error(`MCP client "${this.opts.name}" not connected (state=${this.state})`);
    }
    // Delegate to the active transport
    if (this.sseTransport) {
      return this.sseTransport.callTool(name, input, opts);
    }
    if (this.httpTransport) {
      return this.httpTransport.callTool(name, input, opts);
    }
    // stdio
    const res = await this.request('tools/call', { name, arguments: input }, undefined, opts);
    return toToolCallResult(res);
  }

  /**
   * Put the pages of a `-32042` tool-call error to the user (consent first,
   * nothing opened without it), on the run whose call got the error.
   */
  presentUrlElicitations(
    elicitations: readonly UrlElicitation[],
    signal: AbortSignal,
  ): ReturnType<ServerRequestResponder['presentUrl']> {
    return this.serverRequests.presentUrl(elicitations, signal);
  }

  async listResources(opts: MCPPageOptions = {}): Promise<MCPListResourcesResult> {
    return this.capabilityClient.listResources(opts);
  }

  async listResourceTemplates(opts: MCPPageOptions = {}): Promise<MCPListResourceTemplatesResult> {
    return this.capabilityClient.listResourceTemplates(opts);
  }

  async readResource(uri: string, opts: MCPRequestOptions = {}): Promise<MCPReadResourceResult> {
    return this.capabilityClient.readResource(uri, opts);
  }

  async subscribeResource(uri: string, opts: MCPRequestOptions = {}): Promise<void> {
    return this.capabilityClient.subscribeResource(uri, opts);
  }

  async unsubscribeResource(uri: string, opts: MCPRequestOptions = {}): Promise<void> {
    return this.capabilityClient.unsubscribeResource(uri, opts);
  }

  async listPrompts(opts: MCPPageOptions = {}): Promise<MCPListPromptsResult> {
    return this.capabilityClient.listPrompts(opts);
  }

  async getPrompt(
    name: string,
    args?: Record<string, string> | undefined,
    opts: MCPRequestOptions = {},
  ): Promise<MCPGetPromptResult> {
    return this.capabilityClient.getPrompt(name, args, opts);
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeInner().finally(() => {
      this.closePromise = undefined;
    });
    return this.closePromise;
  }

  private async closeInner(): Promise<void> {
    this.toolCatalogVersion++;
    if (this.child) {
      const child = this.child;
      // Always register the listener first. Checking exitCode/signalCode
      // before registering creates a TOCTOU race: the child can exit between
      // the check and child.once('exit', ...), so the listener never fires
      // and exitPromise hangs forever. The double-check below handles the
      // case where the child already exited before we registered.
      const exitPromise = new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        if (child.exitCode !== null || child.signalCode !== null) resolve();
      });
      try {
        if (
          process.platform === 'win32' &&
          child.stdin &&
          !child.stdin.destroyed &&
          child.stdin.writable
        ) {
          // Windows launches command shims through cmd.exe. Killing that
          // wrapper does not signal the real MCP server and can orphan it
          // before tree escalation still has a live root PID. EOF on the
          // protocol stream reaches the real server and gives it the normal
          // stdio shutdown contract instead.
          child.stdin.end();
        } else {
          // POSIX children receive the conventional graceful signal directly.
          child.kill();
        }
      } catch {
        // ignore; the forced path below remains the final backstop
      }
      // Wait briefly for graceful exit, then escalate to SIGKILL. A stuck
      // server that ignores SIGTERM would otherwise stay alive after
      // close() returns — orphan child processes accumulate over restarts.
      const GRACEFUL_MS = 800;
      const FORCE_TIMEOUT_MS = 1200;
      let gracefulTimer: NodeJS.Timeout | undefined;
      const gracefulRace = await Promise.race([
        exitPromise.then(() => 'exited' as const),
        new Promise<'timeout'>((resolve) => {
          gracefulTimer = setTimeout(() => resolve('timeout'), GRACEFUL_MS);
          gracefulTimer.unref?.();
        }),
      ]);
      clearTimeout(gracefulTimer);
      if (gracefulRace === 'timeout') {
        // A Windows server that does not exit on stdin EOF is rooted at the
        // still-live cmd.exe wrapper, so taskkill /T /F can reliably remove
        // the complete tree. POSIX SIGKILLs the child directly.
        forceKillTree(child);
        let forceTimer: NodeJS.Timeout | undefined;
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            forceTimer = setTimeout(resolve, FORCE_TIMEOUT_MS);
            forceTimer.unref?.();
          }),
        ]);
        clearTimeout(forceTimer);
      }
      // Detach all listeners and drop the reference so the child process
      // object and its stdio streams can be garbage-collected.
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      child.removeAllListeners();
      this.child = undefined;
    }
    // Reject pending requests BEFORE closing transports. This matters for
    // in-flight HTTP requests: they are not yet in `this.pending` (waiting
    // for a response from the network), so failPending() must run while the
    // transport is still alive. After this, the transport close is safe to
    // call even on a never-started or HTTP-only client — the exit handler
    // may have already run failPending, but calling it again with the same
    // pending set is a no-op (failPending guards on `this.pending.size`).
    this.failPending(`MCP "${this.opts.name}" closed`);
    this.serverRequests.dispose();
    // Awaited so close() resolves only once the transport has released its
    // connection pool and aborted its in-flight requests.
    await Promise.allSettled([this.sseTransport?.close(), this.httpTransport?.close()]);
    this.state = 'disconnected';
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs?: number | undefined,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse> {
    const defaultTimeoutMs =
      typeof this.opts.requestTimeoutMs === 'number' &&
      Number.isFinite(this.opts.requestTimeoutMs) &&
      this.opts.requestTimeoutMs > 0
        ? this.opts.requestTimeoutMs
        : 60_000;
    const effectiveTimeoutMs =
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : defaultTimeoutMs;

    // For HTTP transports, delegate to the transport's request method.
    // SSE and streamable-http both use postRaw which handles the full
    // round-trip including timeout signal.
    if (this.sseTransport)
      return this.sseTransport.request(method, params, effectiveTimeoutMs, opts);
    if (this.httpTransport)
      return this.httpTransport.request(method, params, effectiveTimeoutMs, opts);

    // stdio path
    const signal = opts?.signal;
    if (signal?.aborted) {
      const err = new Error(`MCP "${this.opts.name}" request "${method}" aborted before send`);
      err.name = 'AbortError';
      return Promise.reject(err);
    }
    const id = this.nextId;
    this.nextId = nextJsonRpcId(id);
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      // Abort support: drop the pending entry, notify the server per the MCP
      // cancellation spec (`notifications/cancelled`, best-effort — the
      // server SHOULD stop processing), and surface an AbortError so the
      // executor classifies it as user cancellation (never retried).
      const onAbort = signal
        ? () => {
            const pending = this.pending.get(id);
            this.pending.delete(id);
            if (pending) clearTimeout(pending.timer);
            void this.notify('notifications/cancelled', {
              requestId: id,
              reason: 'client aborted',
            }).catch(() => {
              /* best-effort — the child may already be gone */
            });
            const err = new Error(`MCP "${this.opts.name}" request "${method}" aborted by client`);
            err.name = 'AbortError';
            reject(err);
          }
        : undefined;
      if (signal && onAbort) signal.addEventListener('abort', onAbort, { once: true });
      const detach = () => {
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      };
      const onTimeout = () => {
        // A server waiting on the user's elicitation answer is not stalled.
        if (this.serverRequests.awaitingUser) {
          entry.timer = setTimeout(onTimeout, effectiveTimeoutMs);
          return;
        }
        this.pending.delete(id);
        detach();
        reject(
          new Error(
            `MCP "${this.opts.name}" request "${method}" timed out after ${effectiveTimeoutMs}ms`,
          ),
        );
      };
      const entry = {
        resolve: (res: JsonRpcResponse) => {
          clearTimeout(entry.timer);
          detach();
          resolve(res);
        },
        reject: (err: Error) => {
          clearTimeout(entry.timer);
          detach();
          reject(err);
        },
        timer: setTimeout(onTimeout, effectiveTimeoutMs),
      };
      this.pending.set(id, entry);
      const stdin = this.child?.stdin;
      if (!stdin || stdin.destroyed) {
        // No writable stdin (child never spawned, already exited, or stream
        // destroyed). Reject immediately instead of leaving the request
        // pending until it times out.
        const pending = this.pending.get(id);
        this.pending.delete(id);
        if (pending) clearTimeout(pending.timer);
        detach();
        reject(new Error(`MCP "${this.opts.name}" request "${method}": stdin not writable`));
        return;
      }
      try {
        stdin.write(JSON.stringify(req) + '\n');
      } catch (err) {
        const pending = this.pending.get(id);
        this.pending.delete(id);
        if (pending) clearTimeout(pending.timer);
        detach();
        reject(err);
      }
    });
  }

  private async requestCapability<T>(
    capability: 'resources' | 'prompts',
    method: string,
    params: unknown,
    parse: (value: unknown) => T,
    opts: MCPRequestOptions,
  ): Promise<T> {
    if (this.state !== 'connected') {
      throw new Error(`MCP client "${this.opts.name}" not connected (state=${this.state})`);
    }
    const metadata = this._serverMetadata;
    if (!metadata) {
      throw new Error(
        `MCP server "${this.opts.name}" capability metadata is unavailable for ${method}`,
      );
    }
    if (!metadata.capabilities[capability]) {
      throw new Error(
        `MCP server "${this.opts.name}" does not advertise the ${capability} capability`,
      );
    }
    const response = await this.request(method, params, undefined, opts);
    if (response.error) {
      throw new Error(`MCP ${method} failed: ${response.error.message}`);
    }
    return parse(response.result);
  }

  private requireResourceSubscriptions(method: string): void {
    if (this.state !== 'connected') {
      throw new Error(`MCP client "${this.opts.name}" not connected (state=${this.state})`);
    }
    if (this._serverMetadata?.capabilities.resources?.subscribe !== true) {
      throw new Error(
        `MCP server "${this.opts.name}" does not advertise resource subscriptions for ${method}`,
      );
    }
  }

  /**
   * Reject every in-flight {@link request} call. Used when the underlying
   * transport dies — without this, callers awaiting `tools/call` over a
   * killed stdio child or a closed transport would hang indefinitely.
   */
  private failPending(reason: string): void {
    if (this.pending.size === 0) return;
    const err = new Error(reason);
    for (const [, entry] of this.pending) {
      try {
        clearTimeout(entry.timer);
        entry.reject(err);
      } catch {
        /* ignore */
      }
    }
    this.pending.clear();
  }

  private async notify(method: string, params: unknown): Promise<void> {
    return notifyStdio(this.clientStdioHost(), method, params);
  }

  private onData(s: string): void {
    receiveStdioData(this.clientStdioProtocolHost(), s);
  }

  private onLine(line: string): void {
    receiveStdioLine(this.clientStdioProtocolHost(), line);
  }

  private async handleServerRequest(request: JsonRpcServerRequest): Promise<void> {
    const response = await this.serverRequests.answer(request);
    try {
      this.child?.stdin?.write(`${JSON.stringify(response)}\n`);
    } catch {
      // Best-effort protocol reply. A closed stdio stream is handled by the
      // normal child-exit path, which also rejects every pending client call.
    }
  }

  /**
   * L2-C: refresh the cached tool list when the server announces a
   * `tools/list_changed`. Listeners (the registry) re-wrap and
   * re-register. Failures are swallowed — a stale cache is preferable
   * to a hard crash on a transient notification glitch.
   */
  private async handleToolsListChanged(): Promise<void> {
    const version = ++this.toolCatalogVersion;
    try {
      const tools = await listAllTools((params) => this.request('tools/list', params));
      // An error response used to normalize to [] and wipe every registered
      // tool on a transient refresh failure — keep the last catalog instead.
      if (!tools || version !== this.toolCatalogVersion) return;
      this._tools = tools;
      this._toolsCache = tools;
      this.toolCatalogRevision++;
      for (const listener of this.toolsChangedListeners) {
        try {
          listener(this.opts.name, [...tools]);
        } catch {
          // listeners must be best-effort
        }
      }
    } catch {
      // ignore — keep the existing cache
    }
  }

  addToolsChangedListener(listener: ToolsChangedListener): void {
    this.toolsChangedListeners.add(listener);
  }

  removeToolsChangedListener(listener: ToolsChangedListener): void {
    this.toolsChangedListeners.delete(listener);
  }

  addResourcesChangedListener(listener: MCPListChangedListener): void {
    this.resourcesChangedListeners.add(listener);
  }

  removeResourcesChangedListener(listener: MCPListChangedListener): void {
    this.resourcesChangedListeners.delete(listener);
  }

  addResourceUpdatedListener(listener: MCPResourceUpdatedListener): void {
    this.resourceUpdatedListeners.add(listener);
  }

  removeResourceUpdatedListener(listener: MCPResourceUpdatedListener): void {
    this.resourceUpdatedListeners.delete(listener);
  }

  addPromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.add(listener);
  }

  removePromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.delete(listener);
  }

  private emitResourceUpdated(uri: string): void {
    for (const listener of this.resourceUpdatedListeners) {
      try {
        listener(this.opts.name, uri);
      } catch {
        /* listeners are best-effort */
      }
    }
  }

  private emitCapabilityChanged(capability: 'resources' | 'prompts'): void {
    const listeners =
      capability === 'resources' ? this.resourcesChangedListeners : this.promptsChangedListeners;
    for (const listener of listeners) {
      try {
        listener(this.opts.name);
      } catch {
        /* listeners are best-effort */
      }
    }
  }

  private clientHttpConnectionHost(): ClientHttpConnectionHost {
    const self = this;
    return {
      opts: this.opts,
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
      disconnectListeners: this.disconnectListeners,
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
      toolsChangedListeners: this.toolsChangedListeners,
      emitCapabilityChanged: (...args) => this.emitCapabilityChanged(...args),
      emitResourceUpdated: (uri: string) => this.emitResourceUpdated(uri),
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
      serverRequests: this.serverRequests,
    };
  }

  private clientStdioHost(): ClientStdioHost {
    const self = this;
    return {
      opts: this.opts,
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
      onData: (...args) => this.onData(...args),
      onLine: (...args) => this.onLine(...args),
      failPending: (...args) => this.failPending(...args),
      exitListeners: this.exitListeners,
      request: (...args) => this.request(...args),
      serverRequests: this.serverRequests,
      get _serverMetadata() {
        return self._serverMetadata;
      },
      set _serverMetadata(value) {
        self._serverMetadata = value;
      },
      notify: (...args) => this.notify(...args),
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

  private clientStdioProtocolHost(): ClientStdioProtocolHost {
    const self = this;
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
      failPending: (...args) => this.failPending(...args),
      opts: this.opts,
      close: (...args) => this.close(...args),
      onLine: (...args) => this.onLine(...args),
      handleServerRequest: (...args) => this.handleServerRequest(...args),
      serverRequests: this.serverRequests,
      handleToolsListChanged: (...args) => this.handleToolsListChanged(...args),
      emitCapabilityChanged: (...args) => this.emitCapabilityChanged(...args),
      emitResourceUpdated: (...args) => this.emitResourceUpdated(...args),
      pending: this.pending,
    };
  }
}

export type {
  MCPClientOptions,
  MCPListChangedListener,
  MCPPageOptions,
  MCPRequestOptions,
  MCPResourceUpdatedListener,
  Transport,
} from './client-types.js';
