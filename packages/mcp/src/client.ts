import type { ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { MCPCapabilityClient } from './client-capabilities.js';
import {
  buildClientHttpConnectionHost,
  buildClientStdioHost,
  buildClientStdioProtocolHost,
} from './client-hosts.js';
import {
  connectSSE as delegateConnectSSE,
  connectStreamableHTTP as delegateConnectStreamableHTTP,
} from './client-http-connection.js';
import type { MCPClientInternals, PendingStdioRequest } from './client-internals.js';
import {
  closeClient,
  refreshToolsOnListChanged,
  requestCapability,
  requireResourceSubscriptions,
} from './client-lifecycle.js';
import { parseEmptyResult, validateProtocolString } from './client-protocol-helpers.js';
import { connectStdio, notifyStdio } from './client-stdio.js';
import { receiveStdioData, receiveStdioLine } from './client-stdio-protocol.js';
import {
  failPendingRequests,
  resolveRequestTimeoutMs,
  sendStdioRequest,
} from './client-stdio-request.js';
import type {
  ExitListener,
  JsonRpcServerRequest,
  MCPClientOptions,
  MCPListChangedListener,
  MCPLogMessageListener,
  MCPPageOptions,
  MCPProgressListener,
  MCPRequestOptions,
  MCPResourceUpdatedListener,
  ToolsChangedListener,
} from './client-types.js';
import type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult } from './contracts.js';
import { ServerRequestResponder, type UrlElicitation } from './elicitation.js';
import {
  type MCPCompletionReference,
  type MCPCompletionResult,
  type MCPGetPromptResult,
  type MCPListPromptsResult,
  type MCPListResourcesResult,
  type MCPListResourceTemplatesResult,
  type MCPReadResourceResult,
  type MCPServerMetadata,
  parseCompletionResult,
} from './protocol.js';
import { toToolCallResult } from './tool-schema.js';
import type { SSETransport, StreamableHTTPTransport } from './transport.js';

export { forceKillTree } from './client-process.js';

export { quoteWindowsArg } from './client-protocol-helpers.js';

export type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult };

export class MCPClient {
  private readonly capabilityClient = new MCPCapabilityClient(
    (...args) => requestCapability(this.internals(), ...args),
    (method) => requireResourceSubscriptions(this.internals(), method),
  );

  private state: ConnectionState = 'idle';
  private child?: ChildProcess | undefined;
  protected nextId = 1;
  /**
   * In-flight JSON-RPC calls keyed by id. `resolve` settles the call; `reject`
   * is invoked from {@link failPending} when the underlying transport dies
   * (stdio child exit, `close()`) so callers don't hang forever.
   */
  private readonly pending = new Map<number, PendingStdioRequest>();
  /**
   * The unterminated tail of stdout, as the chunks it arrived in; joined only
   * when its newline arrives. Kept as one string (`+=` then `indexOf`), every
   * chunk flattened and re-scanned everything buffered so far — O(n²) for a
   * multi-MiB tools/call result.
   */
  private rxParts: string[] = [];
  protected get rxBuffer(): string {
    return this.rxParts.join('');
  }
  protected set rxBuffer(value: string) {
    this.rxParts = value ? [value] : [];
  }
  protected rxBufferBytes = 0;
  /**
   * Incremental UTF-8 decoder for the stdio rx path. A pipe read boundary can
   * land inside a multi-byte sequence; decoding each chunk with
   * `chunk.toString()` would replace it with U+FFFD and silently corrupt the
   * JSON-RPC payload. StringDecoder withholds the partial sequence until the
   * chunk that completes it (same remedy as `readFileHead` in core utils).
   */
  protected rxDecoder = new StringDecoder('utf8');
  private _tools: MCPTool[] = [];
  /** Server-declared handshake metadata. Populated for stdio in the first protocol slice. */
  private _serverMetadata?: MCPServerMetadata | undefined;
  /** Cached tool list — survives reconnects so the registry can re-register without re-discovering. */
  private _toolsCache?: MCPTool[] | undefined;
  protected _drainPending = false;
  private _lastNotifySkipped = false;
  private closePromise?: Promise<void> | undefined;
  private connectPromise?: Promise<void> | undefined;
  protected toolCatalogVersion = 0;
  protected toolCatalogRevision = 0;
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
  private readonly progressListeners = new Set<MCPProgressListener>();
  private readonly logMessageListeners = new Set<MCPLogMessageListener>();
  /** Per-request `progressToken` source for calls that opt into progress. */
  private progressTokenCounter = 0;
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
    return connectStdio(buildClientStdioHost(this.internals()));
  }

  private async connectSSE(): Promise<void> {
    return delegateConnectSSE(buildClientHttpConnectionHost(this.internals()));
  }

  private async connectStreamableHTTP(): Promise<void> {
    return delegateConnectStreamableHTTP(buildClientHttpConnectionHost(this.internals()));
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
    // The progressToken opts the call into `notifications/progress` while it
    // runs (2024-11-05 progress utility) — a server MAY answer with progress
    // notifications carrying this token.
    const res = await this.request(
      'tools/call',
      { name, arguments: input, _meta: { progressToken: this.nextProgressToken() } },
      undefined,
      opts,
    );
    return toToolCallResult(res);
  }

  /**
   * Fresh `params._meta.progressToken` for a request that opts into
   * `notifications/progress`. Unique per client, so
   * `(server name, token)` identifies the in-flight request a progress
   * notification belongs to.
   */
  private nextProgressToken(): string {
    this.progressTokenCounter += 1;
    return `progress-${this.progressTokenCounter}`;
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

  /**
   * Liveness check (MCP `ping`): the server MUST answer promptly with an
   * empty result. Works on every transport — a cheap connection health probe
   * before a long call, and the natural reconnect-readiness check.
   */
  async ping(opts: MCPRequestOptions = {}): Promise<void> {
    const res = await this.request('ping', {}, undefined, opts);
    if (res.error) {
      throw new Error(`MCP ping failed: ${res.error.message}`);
    }
    parseEmptyResult(res.result);
  }

  /**
   * Argument autocompletion (MCP `completion/complete`, 2024-11-05). The
   * server must advertise the `completions` capability; an unsupported
   * server answers with a JSON-RPC error, which surfaces here as a throw.
   */
  async complete(
    ref: MCPCompletionReference,
    argument: { name: string; value: string },
    opts: MCPRequestOptions = {},
  ): Promise<MCPCompletionResult> {
    validateProtocolString(argument.name, 'completion argument name');
    const res = await this.request('completion/complete', { ref, argument }, undefined, opts);
    if (res.error) {
      throw new Error(`MCP completion/complete failed: ${res.error.message}`);
    }
    return parseCompletionResult(res.result);
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeInner().finally(() => {
      this.closePromise = undefined;
    });
    return this.closePromise;
  }

  private async closeInner(): Promise<void> {
    return closeClient(this.internals());
  }

  /**
   * This client as the structural view its extracted method bodies take
   * (see client-internals.ts). Members read only through this view are
   * `protected` rather than `private` so `noUnusedLocals` sees them as used;
   * either way they stay hidden from consumers.
   */
  private internals(): MCPClientInternals {
    return this as unknown as MCPClientInternals;
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs?: number | undefined,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse> {
    const effectiveTimeoutMs = resolveRequestTimeoutMs(this.opts.requestTimeoutMs, timeoutMs);

    // For HTTP transports, delegate to the transport's request method.
    // SSE and streamable-http both use postRaw which handles the full
    // round-trip including timeout signal.
    if (this.sseTransport)
      return this.sseTransport.request(method, params, effectiveTimeoutMs, opts);
    if (this.httpTransport)
      return this.httpTransport.request(method, params, effectiveTimeoutMs, opts);

    // stdio path
    return sendStdioRequest(this.internals(), method, params, effectiveTimeoutMs, opts);
  }

  /**
   * Reject every in-flight {@link request} call. Used when the underlying
   * transport dies — without this, callers awaiting `tools/call` over a
   * killed stdio child or a closed transport would hang indefinitely.
   */
  protected failPending(reason: string): void {
    failPendingRequests(this.pending, reason);
  }

  protected async notify(method: string, params: unknown): Promise<void> {
    return notifyStdio(buildClientStdioHost(this.internals()), method, params);
  }

  protected onData(s: string): void {
    receiveStdioData(buildClientStdioProtocolHost(this.internals()), s);
  }

  protected onLine(line: string): void {
    receiveStdioLine(buildClientStdioProtocolHost(this.internals()), line);
  }

  protected async handleServerRequest(request: JsonRpcServerRequest): Promise<void> {
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
  protected async handleToolsListChanged(): Promise<void> {
    return refreshToolsOnListChanged(this.internals());
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

  addProgressListener(listener: MCPProgressListener): void {
    this.progressListeners.add(listener);
  }

  removeProgressListener(listener: MCPProgressListener): void {
    this.progressListeners.delete(listener);
  }

  addLogMessageListener(listener: MCPLogMessageListener): void {
    this.logMessageListeners.add(listener);
  }

  removeLogMessageListener(listener: MCPLogMessageListener): void {
    this.logMessageListeners.delete(listener);
  }

  addPromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.add(listener);
  }

  removePromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.delete(listener);
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
