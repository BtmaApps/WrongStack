import { type ChildProcess, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { buildChildEnv, buildWin32CmdShimInvocation, toErrorMessage } from '@wrongstack/core/utils';
import type { ExitListener, MCPClientOptions } from './client-types.js';
import { assertSupportedServerProtocolVersion, MCP_CONSTANTS } from './constants.js';
import type { ConnectionState, JsonRpcResponse, MCPTool } from './contracts.js';
import type { ServerRequestResponder } from './elicitation.js';
import { type MCPServerMetadata, parseServerMetadata } from './protocol.js';
import { listAllTools } from './tool-schema.js';

export interface ClientStdioHost {
  readonly opts: MCPClientOptions;
  state: ConnectionState;
  rxBuffer: string;
  rxBufferBytes: number;
  rxDecoder: StringDecoder;
  child: ChildProcess | undefined;
  onData(s: string): void;
  onLine(line: string): void;
  failPending(reason: string): void;
  readonly exitListeners: Set<ExitListener>;
  request(
    method: string,
    params: unknown,
    timeoutMs?: number | undefined,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse>;
  readonly serverRequests: ServerRequestResponder;
  _serverMetadata: MCPServerMetadata | undefined;
  notify(method: string, params: unknown): Promise<void>;
  readonly toolCatalogRevision: number;
  _tools: MCPTool[];
  _toolsCache: MCPTool[] | undefined;
  _drainPending: boolean;
  _lastNotifySkipped: boolean;
}

export async function connectStdio(host: ClientStdioHost): Promise<void> {
  if (!host.opts.command) {
    host.state = 'failed';
    throw new Error('MCP stdio transport requires "command"');
  }

  // Defense-in-depth: clear any rx state from a previous connect attempt
  // on this instance. The registry normally creates a fresh client per
  // (re)connect cycle, but a leftover rxBuffer from a half-initialized
  // attempt would corrupt JSON-RPC parsing on the new stream.
  host.rxBuffer = '';
  host.rxBufferBytes = 0;
  host.rxDecoder = new StringDecoder('utf8');

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
  const extraEnv: Record<string, string> = { ...host.opts.env };
  if (host.opts.passthroughEnv) {
    for (const name of host.opts.passthroughEnv) {
      const val = process.env[name];
      if (val !== undefined) {
        extraEnv[name] = val;
      }
    }
  }
  const isWin = process.platform === 'win32';
  const rawArgs = host.opts.args ?? [];
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
        const shim = buildWin32CmdShimInvocation(host.opts.command, rawArgs);
        return spawn(shim.command, shim.args, {
          env: spawnEnv,
          stdio,
          ...(host.opts.cwd ? { cwd: host.opts.cwd } : {}),
          windowsVerbatimArguments: shim.windowsVerbatimArguments,
          // Without this every MCP server spawned from a console-less host
          // (WebUI server, scheduled runs) opens a visible console window.
          windowsHide: true,
        });
      })()
    : spawn(host.opts.command, rawArgs, {
        env: spawnEnv,
        stdio,
        windowsHide: true,
        ...(host.opts.cwd ? { cwd: host.opts.cwd } : {}),
      });
  host.child = child;

  child.stdout?.on('data', (chunk: Buffer) => host.onData(host.rxDecoder.write(chunk)));
  child.stdout?.on('end', () => {
    // Flush the decoder's withheld bytes together with any buffered partial
    // line — a trailing fragment without a newline is still a frame.
    const tail = host.rxDecoder.end();
    if (tail) host.onData(tail);
    if (host.rxBuffer.trim()) {
      const line = host.rxBuffer.trim();
      host.rxBuffer = '';
      host.onLine(line);
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
    host.failPending(`MCP "${host.opts.name}" stdin error: ${toErrorMessage(err)}`);
  });
  child.on('exit', (code, signal) => {
    host.state = 'disconnected';
    // Reject any in-flight JSON-RPC requests — without this, callers
    // (e.g. callTool during a tool invocation) await forever on a child
    // that has already gone away.
    host.failPending(
      `MCP "${host.opts.name}" child exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`,
    );
    for (const listener of host.exitListeners) {
      try {
        listener(host.opts.name, code, signal);
      } catch {
        /* ignore */
      }
    }
  });
  child.on('error', (err: Error) => {
    host.state = 'failed';
    // Spawn/runtime errors (ENOENT, EACCES, ...) can fire *after* the child
    // handle exists but often without a matching 'exit' event. Without
    // failing in-flight requests here, callers awaiting the startup
    // `initialize` (or any tools/call) hang until their timeout instead of
    // rejecting promptly.
    host.failPending(`MCP "${host.opts.name}" child error: ${toErrorMessage(err)}`);
  });

  const initialize = await host.request(
    'initialize',
    {
      protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
      // Client capabilities: elicitation when the host can ask its user.
      // `tools` is a SERVER capability and never belonged here.
      capabilities: host.serverRequests.capabilities(),
      clientInfo: MCP_CONSTANTS.CLIENT_INFO,
    },
    typeof host.opts.startupTimeoutMs === 'number' &&
      Number.isFinite(host.opts.startupTimeoutMs) &&
      host.opts.startupTimeoutMs > 0
      ? host.opts.startupTimeoutMs
      : 10_000,
  );
  if (initialize.error) {
    host.state = 'failed';
    throw new Error(`MCP initialize failed: ${initialize.error.message}`);
  }
  try {
    host._serverMetadata = parseServerMetadata(initialize.result);
  } catch (err) {
    host.state = 'failed';
    throw new Error(`MCP initialize returned malformed server metadata: ${toErrorMessage(err)}`);
  }
  // stdio carries no `MCP-Protocol-Version` header, but the rule is the same:
  // a server that answered with a revision we do not implement is not a server
  // we can talk to. Throwing here means disconnecting — MCPClient.connect's
  // catch closes the client, which terminates the child process, so nothing is
  // left running behind the failed handshake.
  assertSupportedServerProtocolVersion(host.opts.name, host._serverMetadata.protocolVersion);
  try {
    await host.notify('notifications/initialized', {});
  } catch (err) {
    console.warn(
      '[MCP] notify("notifications/initialized") failed for "' +
        host.opts.name +
        '": ' +
        toErrorMessage(err),
    );
  }
  const revision = host.toolCatalogRevision;
  const tools = (await listAllTools((params) => host.request('tools/list', params))) ?? [];
  if (revision === host.toolCatalogRevision) host._tools = tools;
  // Cache tools so reconnect can re-register without re-discovering
  host._toolsCache = host._tools;
  host.state = 'connected';
}

export async function notifyStdio(
  host: ClientStdioHost,
  method: string,
  params: unknown,
): Promise<void> {
  if (host._drainPending) {
    host._lastNotifySkipped = true;
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'mcp.notify_skipped_backpressure',
        server: host.opts.name,
        method,
        message: 'stdin buffer backpressure (already waiting for drain)',
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }
  const stdin = host.child?.stdin;
  if (!stdin || stdin.destroyed === true || stdin.writable === false) {
    return;
  }
  const req = { jsonrpc: '2.0', method, params };
  const encoded = JSON.stringify(req) + '\n';
  try {
    const ok = stdin.write(encoded);
    if (!ok) {
      host._drainPending = true;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          stdin.removeListener?.('drain', onDrain);
          stdin.removeListener?.('error', onError);
          stdin.removeListener?.('close', onClose);
          host._drainPending = false;
          reject(new Error(`MCP notify("${method}") drain timeout`));
        }, 500);
        const onDrain = () => {
          clearTimeout(timeout);
          stdin.removeListener?.('drain', onDrain);
          stdin.removeListener?.('error', onError);
          stdin.removeListener?.('close', onClose);
          host._drainPending = false;
          resolve();
        };
        const onError = (err: Error) => {
          clearTimeout(timeout);
          stdin.removeListener?.('drain', onDrain);
          stdin.removeListener?.('error', onError);
          stdin.removeListener?.('close', onClose);
          host._drainPending = false;
          reject(err);
        };
        const onClose = () => onError(new Error(`MCP notify("${method}") stdin closed`));
        stdin.once?.('drain', onDrain);
        stdin.once?.('error', onError);
        stdin.once?.('close', onClose);
      });
    }
  } catch (err) {
    throw new Error(`[MCP] notify("${method}") failed: ${toErrorMessage(err)}`);
  }
}
