import { MCP_CONSTANTS } from './constants.js';
import type { JsonRpcResponse, ToolCallResult } from './contracts.js';
import { parseServerMetadata, resourceUpdatedUri } from './protocol.js';
import { MAX_MCP_HTTP_BODY_BYTES, readBodyCapped } from './read-body.js';
import { listAllTools, toToolCallResult } from './tool-schema.js';
import {
  BaseHTTPTransport,
  type HttpTransportOptions,
  makeAbortError,
  nextJsonRpcId,
} from './transport-base.js';
import {
  assertMatchingJsonRpcResult,
  encodeJsonRpcMessage,
  extractJsonRpcEnvelopes,
  extractJsonRpcResults,
  isJsonRpcResult,
  type JsonRpcResult,
} from './transport-jsonrpc.js';

// ---------------------------------------------------------------------------
// Streamable HTTP Transport
// ---------------------------------------------------------------------------

/**
 * Streamable HTTP transport for MCP.
 *
 * Uses session-based HTTP with NDJSON responses.
 */
export class StreamableHTTPTransport extends BaseHTTPTransport {
  private _nextId = 1;
  private closed = false;
  private sessionId?: string | undefined;

  constructor(opts: HttpTransportOptions) {
    super(opts, 'StreamableHTTP');
  }

  protected override genId(): number {
    const id = this._nextId;
    this._nextId = nextJsonRpcId(id);
    return id;
  }

  /**
   * Read a POST's reply. A `text/event-stream` reply is consumed event by
   * event: the server may put notifications and its OWN requests (elicitation)
   * ahead of our response and then wait for our answer to them, so buffering
   * the whole body first would deadlock the call.
   */
  private async readResponse(res: Response, requestId: number): Promise<JsonRpcResult | undefined> {
    const streamed = (res.headers?.get('content-type') ?? '').includes('text/event-stream');
    const body = res.body;
    if (!streamed || !body || typeof body.getReader !== 'function') {
      return this.takeEnvelopes(await readBodyCapped(res), requestId);
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const others: JsonRpcResult[] = [];
    let pending = '';
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_MCP_HTTP_BODY_BYTES) {
          throw new Error(`MCP response stream exceeded ${MAX_MCP_HTTP_BODY_BYTES} bytes`);
        }
        pending += decoder.decode(value, { stream: true });
        const cut = completeEventsEnd(pending);
        if (cut === 0) continue;
        const match = this.takeEnvelopes(pending.slice(0, cut), requestId, others);
        pending = pending.slice(cut);
        if (match) {
          await reader.cancel().catch(() => undefined);
          return match;
        }
      }
      pending += decoder.decode();
      return this.takeEnvelopes(pending, requestId, others) ?? others[0];
    } finally {
      reader.releaseLock?.();
    }
  }

  /**
   * Dispatch the notifications and server requests in `text`, and return the
   * response to `requestId` — falling back to the first other response, which
   * the caller's id check then rejects.
   */
  private takeEnvelopes(
    text: string,
    requestId: number,
    others: JsonRpcResult[] = [],
  ): JsonRpcResult | undefined {
    let match: JsonRpcResult | undefined;
    for (const envelope of extractJsonRpcEnvelopes(text)) {
      if (isJsonRpcResult(envelope)) {
        if (envelope.id === requestId) match ??= envelope;
        else others.push(envelope);
      } else if (envelope.id !== undefined) {
        void this.replyToServer(
          { id: envelope.id, method: envelope.method, params: envelope.params },
          this.url,
          this.sessionHeaders(),
        );
      } else {
        this.handleNotification(envelope.method, envelope.params);
      }
    }
    return match ?? others[0];
  }

  private sessionHeaders(): Record<string, string> {
    return {
      Accept: 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.headers,
    };
  }

  private handleNotification(method: string, params?: unknown): void {
    if (method === 'notifications/cancelled') {
      this.serverRequests.cancel(params);
    } else if (method === 'notifications/resources/list_changed') {
      this.notifyResourcesChanged();
    } else if (method === 'notifications/prompts/list_changed') {
      this.notifyPromptsChanged();
    } else if (method === 'notifications/tools/list_changed') {
      void this.refreshTools();
    } else if (method === 'notifications/resources/updated') {
      const uri = resourceUpdatedUri(params);
      if (uri) this.notifyResourceUpdated(uri);
    }
  }

  private async refreshTools(): Promise<void> {
    try {
      const tools = await listAllTools((params) => this.postRaw('tools/list', params));
      if (!tools) return;
      this.tools.splice(0, this.tools.length, ...tools);
      for (const listener of this.toolsChangedListeners) {
        try {
          listener([...tools]);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* keep the last known tool catalog */
    }
  }

  async connect(): Promise<void> {
    this.closed = false;
    this.state = 'connecting';
    this.serverMetadata = undefined;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const startupTimer = setTimeout(() => this.abortController?.abort(), this.timeout);

    try {
      const initializeId = this.genId();
      const initFetchOpts: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...this.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: initializeId,
          method: 'initialize',
          params: {
            protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
            // Client capabilities: elicitation when the host can ask its user
            // (`tools` is a server capability and never belongs here).
            capabilities: this.serverRequests.capabilities(),
            clientInfo: MCP_CONSTANTS.CLIENT_INFO,
          },
        }),
        signal,
      };
      this.applyTlsAgent(initFetchOpts);
      const initRes = await this.fetchWithAuthorization(this.url, initFetchOpts, signal);

      if (!initRes.ok) {
        throw new Error(`initialize HTTP ${initRes.status}: ${initRes.statusText}`);
      }

      const contentType = initRes.headers.get('content-type') ?? '';
      let data: JsonRpcResult | undefined;

      if (contentType.includes('application/json')) {
        // Capped read — connect() used to call initRes.json() here, which
        // buffered the whole body; every other request path enforces the cap.
        const parsed = JSON.parse(await readBodyCapped(initRes));
        if (isJsonRpcResult(parsed)) data = parsed;
      } else {
        // text/event-stream or NDJSON — handle SSE `data:` framing.
        data = extractJsonRpcResults(await readBodyCapped(initRes))[0];
      }

      if (!data) {
        throw new Error('Could not parse initialize response');
      }
      data = assertMatchingJsonRpcResult(data, initializeId, 'initialize');

      if (data.error) {
        throw new Error(`initialize failed: ${data.error.message}`);
      }
      this.serverMetadata = parseServerMetadata(data.result);
      this.protocolVersion = this.serverMetadata.protocolVersion;

      // MCP Streamable HTTP spec: the server assigns a session via the
      // `Mcp-Session-Id` response header, which the client must echo on every
      // subsequent request. (Header lookups are case-insensitive.)
      this.sessionId = initRes.headers.get('mcp-session-id') ?? undefined;
      await this.postRaw('notifications/initialized', {});

      const tools = await listAllTools((params) => this.postRaw('tools/list', params));
      this.tools.splice(0, this.tools.length, ...(tools ?? []));

      this.state = 'connected';
      clearTimeout(startupTimer);
    } catch (err) {
      clearTimeout(startupTimer);
      this.state = 'failed';
      this.abortController.abort();
      throw err;
    }
  }

  private async postRaw(
    method: string,
    params: unknown,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResult> {
    const id = this.genId();
    const body = encodeJsonRpcMessage(id, method, params);

    const external = opts?.signal;
    const parent =
      external && this.abortController
        ? AbortSignal.any([this.abortController.signal, external])
        : (external ?? this.abortController?.signal);
    const timeoutSignal = this.requestTimeoutSignal(parent, this.requestTimeout);
    const fetchOpts: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        ...this.headers,
      },
      body,
      signal: timeoutSignal.signal,
    };
    this.applyTlsAgent(fetchOpts);
    // fetch lives INSIDE the try so dispose() runs on every exit path — a
    // rejected fetch must not leak the timeout timer / abort listener.
    try {
      const res = await this.fetchWithAuthorization(this.url, fetchOpts, timeoutSignal.signal);
      if (!res.ok) {
        if (StreamableHTTPTransport.SESSION_FATAL_HTTP_STATUSES.has(res.status)) {
          this.markDisconnected();
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      // Notifications get no JSON-RPC reply (the server returns 202 / empty body).
      if (method.startsWith('notifications/')) {
        // 202/empty in practice, but a hostile server can attach a huge body —
        // drain it through the cap instead of res.text().
        await readBodyCapped(res).catch(() => undefined);
        return { jsonrpc: '2.0', id };
      }

      const match = await this.readResponse(res, id);
      if (match) {
        return assertMatchingJsonRpcResult(match, id, method);
      }
      throw new Error('Could not parse response as JSON-RPC');
    } catch (err) {
      if (external?.aborted && !method.startsWith('notifications/')) {
        // MCP spec cancellation: tell the server to stop the in-flight
        // request. Best-effort fire-and-forget.
        void this.postRaw('notifications/cancelled', {
          requestId: id,
          reason: 'client aborted',
        }).catch(() => {});
        throw makeAbortError(method);
      }
      throw err;
    } finally {
      timeoutSignal.dispose();
    }
  }

  /** Generic JSON-RPC request — used by MCPClient.request() for SSE/streamable-http transports. */
  async request(
    method: string,
    params: unknown,
    timeoutMs?: number,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse> {
    const id = this.genId();
    const body = encodeJsonRpcMessage(id, method, params);

    const external = opts?.signal;
    const parent =
      external && this.abortController
        ? AbortSignal.any([this.abortController.signal, external])
        : (external ?? this.abortController?.signal);
    const timeoutSignal = this.requestTimeoutSignal(parent, timeoutMs ?? this.requestTimeout);
    const fetchOpts: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        ...this.headers,
      },
      body,
      signal: timeoutSignal.signal,
    };
    this.applyTlsAgent(fetchOpts);
    try {
      const res = await this.fetchWithAuthorization(this.url, fetchOpts, timeoutSignal.signal);
      if (!res.ok) {
        if (StreamableHTTPTransport.SESSION_FATAL_HTTP_STATUSES.has(res.status)) {
          this.markDisconnected();
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (method.startsWith('notifications/')) {
        // 202/empty in practice, but a hostile server can attach a huge body —
        // drain it through the cap instead of res.text().
        await readBodyCapped(res).catch(() => undefined);
        return { jsonrpc: '2.0', id };
      }

      const parsed = await this.readResponse(res, id);
      if (parsed) {
        // readResponse falls back to the FIRST response when none
        // carries our id; without this check another request's result was
        // returned as this one's.
        const matched = assertMatchingJsonRpcResult(parsed, id, method);
        return {
          jsonrpc: '2.0',
          id,
          result: matched.result,
          error: matched.error,
        };
      }
      throw new Error('Could not parse response as JSON-RPC');
    } catch (err) {
      if (external?.aborted && !method.startsWith('notifications/')) {
        void this.postRaw('notifications/cancelled', {
          requestId: id,
          reason: 'client aborted',
        }).catch(() => {});
        throw makeAbortError(method);
      }
      throw err;
    } finally {
      timeoutSignal.dispose();
    }
  }

  async callTool(
    name: string,
    input: unknown,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<ToolCallResult> {
    if (this.state !== 'connected') {
      throw new Error(`streamable-http transport not connected (state=${this.state})`);
    }
    const res = await this.postRaw('tools/call', { name, arguments: input }, opts);
    return toToolCallResult(res);
  }

  async close(): Promise<void> {
    this.releasePinnedDispatcher();
    // Keyed on `closed`, not state: after a session-fatal status the state is
    // already 'disconnected', and returning early left in-flight requests
    // running against a session the registry had abandoned.
    const alreadyClosed = this.closed;
    this.closed = true;
    this.state = 'disconnected';
    if (alreadyClosed) return;
    this.abortController?.abort();
    // Intentionally do NOT fire disconnect handlers — those trigger
    // reconnection in the registry, which would fight an explicit close().
    this.disconnectHandlers.splice(0, this.disconnectHandlers.length);
  }

  /**
   * HTTP statuses that mean the streamable-http session itself is gone
   * (auth rejected, session id unknown or expired). Only these tear the
   * connection down on the request path; transient faults (5xx, network
   * resets) surface as call errors and keep the session alive so the next
   * request can succeed — the contract pinned by http-fault-soak.test.ts.
   */
  private static readonly SESSION_FATAL_HTTP_STATUSES = new Set([401, 403, 404, 410]);

  private markDisconnected(): void {
    if (this.state === 'connected') {
      this.state = 'disconnected';
      this.notifyDisconnect();
    }
  }
}

/**
 * End of the last complete SSE event in `text` (just past its blank line), or
 * 0 when no event has completed yet.
 */
function completeEventsEnd(text: string): number {
  const lf = text.lastIndexOf('\n\n');
  const crlf = text.lastIndexOf('\r\n\r\n');
  return Math.max(lf === -1 ? 0 : lf + 2, crlf === -1 ? 0 : crlf + 4);
}
