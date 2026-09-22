import { type ChildProcess, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { buildChildEnv, buildWin32CmdShimInvocation, toErrorMessage } from '@wrongstack/core/utils';
import { MCPCapabilityClient } from './client-capabilities.js';
import {
  type ClientHttpConnectionHost,
  connectSSE as delegateConnectSSE,
  connectStreamableHTTP as delegateConnectStreamableHTTP,
} from './client-http-connection.js';
import { forceKillTree } from './client-process.js';
import type {
  ExitListener,
  JsonRpcRequest,
  JsonRpcServerRequest,
  MCPClientOptions,
  MCPListChangedListener,
  MCPPageOptions,
  MCPRequestOptions,
  ToolsChangedListener,
} from './client-types.js';
import { MCP_CONSTANTS } from './constants.js';
import type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult } from './contracts.js';
import {
  type MCPGetPromptResult,
  type MCPListPromptsResult,
  type MCPListResourcesResult,
  type MCPListResourceTemplatesResult,
  type MCPReadResourceResult,
  type MCPServerMetadata,
  parseServerMetadata,
} from './protocol.js';
import { listAllTools } from './tool-schema.js';
import type { SSETransport, StreamableHTTPTransport } from './transport.js';
import { nextJsonRpcId } from './transport-base.js';
import { isJsonRpcResult } from './transport-jsonrpc.js';

export { forceKillTree } from './client-process.js';
export { quoteWindowsArg } from './client-protocol-helpers.js';

export type { ConnectionState, JsonRpcResponse, MCPTool, ToolCallResult };

export class MCPClient {
  private readonly capabilityClient = new MCPCapabilityClient(
    this.requestCapability.bind(this),
    this.requireResourceSubscriptions.bind(this),
  );

  /**
   * Maximum bytes the rx buffer may accumulate before the connection is
   * forcefully closed. A well-behaved JSON-RPC server emits newline-delimited
   * messages that are individually much smaller than this; a server that never
   * sends a newline would grow the buffer without limit and OOM the process.
   * 16 MiB is generous for any legitimate single message while bounding the
   * worst-case memory to a predictable cap.
   */
  private static readonly MAX_RX_BUFFER_BYTES = 16 * 1024 * 1024;

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
  private rxBuffer = '';
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
  // HTTP transports
  private sseTransport?: SSETransport | undefined;
  private httpTransport?: StreamableHTTPTransport | undefined;
  /** Notified when the stdio child process exits so the registry can attempt reconnect. */
  private readonly exitListeners = new Set<ExitListener>();
  /** Notified when the server announces a tools/list_changed notification. */
  private readonly toolsChangedListeners = new Set<ToolsChangedListener>();
  private readonly resourcesChangedListeners = new Set<MCPListChangedListener>();
  private readonly promptsChangedListeners = new Set<MCPListChangedListener>();
  /** Notified when an HTTP transport (SSE or streamable-http) disconnects. */
  private readonly disconnectListeners = new Set<() => void>();

  constructor(public readonly opts: MCPClientOptions) {}

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
    if (!this.opts.command) {
      this.state = 'failed';
      throw new Error('MCP stdio transport requires "command"');
    }

    // Defense-in-depth: clear any rx state from a previous connect attempt
    // on this instance. The registry normally creates a fresh client per
    // (re)connect cycle, but a leftover rxBuffer from a half-initialized
    // attempt would corrupt JSON-RPC parsing on the new stream.
    this.rxBuffer = '';
    this.rxBufferBytes = 0;
    this.rxDecoder = new StringDecoder('utf8');

    // On Windows, MCP servers are usually launched via `npx`/`npm`/`uvx`,
    // which resolve to `.cmd` shims. Since the CVE-2024-27980 fix Node refuses
    // to spawn `.cmd`/`.bat` without a shell (raw spawn throws ENOENT), so the
    // whole npx-based preset catalog is unusable without a shell. We pass the
    // full command line as a single string (with each token cmd.exe-quoted) and
    // `shell: true` — an empty args array avoids the DEP0190 warning that
    // `shell:true` + an args array triggers. Server command+args come from
    // config (admin-controlled), not the model, so shell use is not an
    // injection vector here.
    // Resolve passthroughEnv: forward explicitly-listed env var names from
    // the parent process to the child. This lets MCP server presets (GitHub,
    // Slack, Brave Search, …) get their API tokens without storing them in
    // config.json or being scrubbed by buildChildEnv()'s secret filter.
    const extraEnv: Record<string, string> = { ...this.opts.env };
    if (this.opts.passthroughEnv) {
      for (const name of this.opts.passthroughEnv) {
        const val = process.env[name];
        if (val !== undefined) {
          extraEnv[name] = val;
        }
      }
    }
    const isWin = process.platform === 'win32';
    const rawArgs = this.opts.args ?? [];
    const spawnEnv = buildChildEnv({ extra: extraEnv });
    const stdio: ['pipe', 'pipe', 'pipe'] = ['pipe', 'pipe', 'pipe'];
    // Windows cannot spawn a `.cmd`/`.bat` shim without a shell, but handing the
    // joined line to `shell: true` made `&`, `|`, `<`, `>` command separators —
    // and quoteWindowsArg left any argument without whitespace unquoted, so
    // `--flag=x&calc.exe` chained a second program. MCP `command`/`args` come
    // from config that the WebUI can write, so this was reachable. Use the
    // hardened cmd-shim builder instead: explicit `cmd.exe /d /c call`, every
    // token quoted, metacharacters refused outright (CMDI-005).
    const child = isWin
      ? (() => {
          const shim = buildWin32CmdShimInvocation(this.opts.command, rawArgs);
          return spawn(shim.command, shim.args, {
            env: spawnEnv,
            stdio,
            ...(this.opts.cwd ? { cwd: this.opts.cwd } : {}),
            windowsVerbatimArguments: shim.windowsVerbatimArguments,
            // Without this every MCP server spawned from a console-less host
            // (WebUI server, scheduled runs) opens a visible console window.
            windowsHide: true,
          });
        })()
      : spawn(this.opts.command, rawArgs, {
          env: spawnEnv,
          stdio,
          windowsHide: true,
          ...(this.opts.cwd ? { cwd: this.opts.cwd } : {}),
        });
    this.child = child;

    child.stdout?.on('data', (chunk: Buffer) => this.onData(this.rxDecoder.write(chunk)));
    child.stdout?.on('end', () => {
      // Flush the decoder's withheld bytes together with any buffered partial
      // line — a trailing fragment without a newline is still a frame.
      const tail = this.rxDecoder.end();
      if (tail) this.onData(tail);
      if (this.rxBuffer.trim()) {
        const line = this.rxBuffer.trim();
        this.rxBuffer = '';
        this.onLine(line);
      }
    });
    child.stderr?.on('data', () => {
      // intentionally discard stderr noise from server
    });
    child.stdin?.on('error', (err: Error) => {
      // Pipe failures such as EPIPE are emitted asynchronously by Writable;
      // the try/catch around stdin.write() cannot intercept them. Always own
      // the stream error so a child that exits during startup rejects pending
      // requests instead of surfacing as an uncaught process exception.
      this.failPending(`MCP "${this.opts.name}" stdin error: ${toErrorMessage(err)}`);
    });
    child.on('exit', (code, signal) => {
      this.state = 'disconnected';
      // Reject any in-flight JSON-RPC requests — without this, callers
      // (e.g. callTool during a tool invocation) await forever on a child
      // that has already gone away.
      this.failPending(
        `MCP "${this.opts.name}" child exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`,
      );
      for (const listener of this.exitListeners) {
        try {
          listener(this.opts.name, code, signal);
        } catch {
          /* ignore */
        }
      }
    });
    child.on('error', (err: Error) => {
      this.state = 'failed';
      // Spawn/runtime errors (ENOENT, EACCES, ...) can fire *after* the child
      // handle exists but often without a matching 'exit' event. Without
      // failing in-flight requests here, callers awaiting the startup
      // `initialize` (or any tools/call) hang until their timeout instead of
      // rejecting promptly.
      this.failPending(`MCP "${this.opts.name}" child error: ${toErrorMessage(err)}`);
    });

    const initialize = await this.request(
      'initialize',
      {
        protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
        // Client capabilities (roots/sampling/elicitation) — none offered.
        // `tools` is a SERVER capability and never belonged here.
        capabilities: {},
        clientInfo: MCP_CONSTANTS.CLIENT_INFO,
      },
      this.opts.startupTimeoutMs ?? 10_000,
    );
    if (initialize.error) {
      this.state = 'failed';
      throw new Error(`MCP initialize failed: ${initialize.error.message}`);
    }
    try {
      this._serverMetadata = parseServerMetadata(initialize.result);
    } catch (err) {
      this.state = 'failed';
      throw new Error(`MCP initialize returned malformed server metadata: ${toErrorMessage(err)}`);
    }
    try {
      await this.notify('notifications/initialized', {});
    } catch (err) {
      console.warn(
        '[MCP] notify("notifications/initialized") failed for "' +
          this.opts.name +
          '": ' +
          toErrorMessage(err),
      );
    }
    this._tools = (await listAllTools((params) => this.request('tools/list', params))) ?? [];
    // Cache tools so reconnect can re-register without re-discovering
    this._toolsCache = this._tools;
    this.state = 'connected';
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
    if (res.error) {
      return { content: res.error.message, isError: true };
    }
    const result = res.result as
      | { content?: unknown | undefined; isError?: boolean | undefined }
      | undefined;
    return {
      content: result?.content ?? '',
      isError: Boolean(result?.isError),
    };
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
    // Awaited so close() resolves only once the transport has released its
    // connection pool and aborted its in-flight requests.
    await Promise.allSettled([this.sseTransport?.close(), this.httpTransport?.close()]);
    this.state = 'disconnected';
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs = this.opts.requestTimeoutMs ?? 60_000,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse> {
    // For HTTP transports, delegate to the transport's request method.
    // SSE and streamable-http both use postRaw which handles the full
    // round-trip including timeout signal.
    if (this.sseTransport) return this.sseTransport.request(method, params, timeoutMs, opts);
    if (this.httpTransport) return this.httpTransport.request(method, params, timeoutMs, opts);

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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        detach();
        reject(
          new Error(`MCP "${this.opts.name}" request "${method}" timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          detach();
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          detach();
          reject(err);
        },
        timer,
      });
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
    if (this._drainPending) {
      this._lastNotifySkipped = true;
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'mcp.notify_skipped_backpressure',
          server: this.opts.name,
          method,
          message: 'stdin buffer backpressure (already waiting for drain)',
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed === true || stdin.writable === false) {
      return;
    }
    const req = { jsonrpc: '2.0', method, params };
    const encoded = JSON.stringify(req) + '\n';
    try {
      const ok = stdin.write(encoded);
      if (!ok) {
        this._drainPending = true;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            stdin.removeListener?.('drain', onDrain);
            stdin.removeListener?.('error', onError);
            this._drainPending = false;
            reject(new Error(`MCP notify("${method}") drain timeout`));
          }, 500);
          const onDrain = () => {
            clearTimeout(timeout);
            stdin.removeListener?.('drain', onDrain);
            stdin.removeListener?.('error', onError);
            this._drainPending = false;
            resolve();
          };
          const onError = (err: Error) => {
            clearTimeout(timeout);
            stdin.removeListener?.('drain', onDrain);
            stdin.removeListener?.('error', onError);
            this._drainPending = false;
            reject(err);
          };
          stdin.once?.('drain', onDrain);
          stdin.once?.('error', onError);
        });
      }
    } catch (err) {
      throw new Error(`[MCP] notify("${method}") failed: ${toErrorMessage(err)}`);
    }
  }

  private onData(s: string): void {
    this.rxBuffer += s;
    this.rxBufferBytes += Buffer.byteLength(s, 'utf8');

    // Guard against a malicious or buggy server that never emits a newline —
    // without this cap the buffer grows without limit and OOMs the process.
    if (this.rxBufferBytes > MCPClient.MAX_RX_BUFFER_BYTES) {
      const truncated = this.rxBufferBytes;
      this.rxBuffer = '';
      this.rxBufferBytes = 0;
      this.failPending(
        `MCP "${this.opts.name}" rx buffer overflow (${truncated} bytes without a newline) — closing connection`,
      );
      void this.close();
      return;
    }

    let start = 0;
    let idx = this.rxBuffer.indexOf('\n');
    while (idx !== -1) {
      const line = this.rxBuffer.slice(start, idx).trim();
      start = idx + 1;
      if (line) this.onLine(line);
      idx = this.rxBuffer.indexOf('\n', start);
    }
    if (start > 0) {
      this.rxBufferBytes -= Buffer.byteLength(this.rxBuffer.slice(0, start), 'utf8');
      this.rxBuffer = this.rxBuffer.slice(start);
    }
  }

  private onLine(line: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (typeof msg !== 'object' || msg === null) return;
    const envelope = msg as Record<string, unknown>;
    if (envelope['jsonrpc'] !== '2.0') return;

    // A server request is never a response, even if its id collides with one
    // of our pending calls. Resolve pending calls only after the envelope has
    // passed the strict response guard below.
    if (typeof envelope['method'] === 'string') {
      const id = envelope['id'];
      if (typeof id === 'number' || typeof id === 'string') {
        this.handleServerRequest({
          jsonrpc: '2.0',
          id,
          method: envelope['method'],
          params: envelope['params'],
        });
        return;
      }

      // Notifications have a `method` but no `id`. The MCP spec defines
      // list_changed notifications for cache invalidation.
      if (Object.hasOwn(envelope, 'id')) return;
      if (envelope['method'] === 'notifications/tools/list_changed') {
        void this.handleToolsListChanged();
      } else if (envelope['method'] === 'notifications/resources/list_changed') {
        this.emitCapabilityChanged('resources');
      } else if (envelope['method'] === 'notifications/prompts/list_changed') {
        this.emitCapabilityChanged('prompts');
      }
      return;
    }

    if (!isJsonRpcResult(msg)) return;
    const response = msg as JsonRpcResponse;
    if (this.pending.has(response.id)) {
      const entry = this.pending.get(response.id);
      this.pending.delete(response.id);
      entry?.resolve(response);
    }
  }

  private handleServerRequest(request: JsonRpcServerRequest): void {
    // `ping` is valid in both directions and MUST be answered with an empty
    // result — servers that probe liveness treated the old "Method not found"
    // as a dead client.
    const response =
      request.method === 'ping'
        ? { jsonrpc: '2.0', id: request.id, result: {} }
        : {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message:
                request.method === 'sampling/createMessage'
                  ? 'Client sampling is disabled by policy'
                  : `Method not found: ${request.method}`,
            },
          };

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
    try {
      const tools = await listAllTools((params) => this.request('tools/list', params));
      // An error response used to normalize to [] and wipe every registered
      // tool on a transient refresh failure — keep the last catalog instead.
      if (!tools) return;
      this._tools = tools;
      this._toolsCache = tools;
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

  addPromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.add(listener);
  }

  removePromptsChangedListener(listener: MCPListChangedListener): void {
    this.promptsChangedListeners.delete(listener);
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
      get opts() {
        return self.opts;
      },
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
    };
  }
}
export type {
  MCPClientOptions,
  MCPListChangedListener,
  MCPPageOptions,
  MCPRequestOptions,
  Transport,
} from './client-types.js';
