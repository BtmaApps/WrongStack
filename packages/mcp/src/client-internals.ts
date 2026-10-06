import type { ChildProcess } from 'node:child_process';
import type { StringDecoder } from 'node:string_decoder';
import type {
  ExitListener,
  JsonRpcServerRequest,
  MCPClientOptions,
  MCPListChangedListener,
  MCPLogMessageListener,
  MCPProgressListener,
  MCPResourceUpdatedListener,
  ToolsChangedListener,
} from './client-types.js';
import type { ConnectionState, JsonRpcResponse, MCPTool } from './contracts.js';
import type { ServerRequestResponder } from './elicitation.js';
import type { MCPServerMetadata } from './protocol.js';
import type { SSETransport, StreamableHTTPTransport } from './transport.js';

/** One in-flight stdio JSON-RPC call, keyed by id in {@link MCPClientInternals.pending}. */
export interface PendingStdioRequest {
  resolve: (res: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * The private state and private methods of `MCPClient`, as seen by the free
 * functions its method bodies were extracted into (client-hosts,
 * client-stdio-request, client-lifecycle). The class keeps these members
 * private to its consumers and hands itself to those functions through this
 * structural view.
 */
export interface MCPClientInternals {
  readonly opts: MCPClientOptions;
  state: ConnectionState;
  child: ChildProcess | undefined;
  nextId: number;
  readonly pending: Map<number, PendingStdioRequest>;
  rxParts: string[];
  rxBuffer: string;
  rxBufferBytes: number;
  rxDecoder: StringDecoder;
  _tools: MCPTool[];
  _serverMetadata: MCPServerMetadata | undefined;
  _toolsCache: MCPTool[] | undefined;
  _drainPending: boolean;
  _lastNotifySkipped: boolean;
  toolCatalogVersion: number;
  toolCatalogRevision: number;
  sseTransport: SSETransport | undefined;
  httpTransport: StreamableHTTPTransport | undefined;
  readonly exitListeners: Set<ExitListener>;
  readonly toolsChangedListeners: Set<ToolsChangedListener>;
  readonly resourcesChangedListeners: Set<MCPListChangedListener>;
  readonly promptsChangedListeners: Set<MCPListChangedListener>;
  readonly resourceUpdatedListeners: Set<MCPResourceUpdatedListener>;
  readonly progressListeners: Set<MCPProgressListener>;
  readonly logMessageListeners: Set<MCPLogMessageListener>;
  readonly disconnectListeners: Set<() => void>;
  readonly serverRequests: ServerRequestResponder;
  request(
    method: string,
    params: unknown,
    timeoutMs?: number | undefined,
    opts?: { signal?: AbortSignal | undefined },
  ): Promise<JsonRpcResponse>;
  notify(method: string, params: unknown): Promise<void>;
  failPending(reason: string): void;
  onData(s: string): void;
  onLine(line: string): void;
  close(): Promise<void>;
  handleServerRequest(request: JsonRpcServerRequest): Promise<void>;
  handleToolsListChanged(): Promise<void>;
}
