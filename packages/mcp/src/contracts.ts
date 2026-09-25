/**
 * Leaf contract types for the @wrongstack/mcp public surface.
 *
 * Lives separately from `client.ts` so callers (transport implementations,
 * schema normalisers, registry helpers) can depend on the wire-level types
 * without pulling in the MCP client implementation. Breaks the long-standing
 * type-level SCC ARCH-CYCLE-TYPE-17 where `client.ts` both homed the shared
 * contracts and was imported back by every transport/schema module.
 *
 * This module MUST contain no runtime imports.
 */

/** Connection lifecycle states for an MCP client. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed'
  /** Lazy server: registered from a cached manifest, process not spawned. */
  | 'dormant';

/** Minimal MCP tool descriptor returned by `tools/list`. */
export interface MCPTool {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
  /** JSON Schema of the tool's `structuredContent` (spec 2025-06-18). */
  outputSchema?: Record<string, unknown> | undefined;
}

/**
 * URL-mode elicitation (spec 2025-11-25): the server asks the user to open a
 * web page for something that must not pass through the client — a
 * third-party sign-in, an API key, a payment. Only the user's consent crosses
 * the protocol; what happens on the page stays between the user and the server.
 */
export interface UrlElicitation {
  mode: 'url';
  message: string;
  url: string;
  elicitationId: string;
}

/** Result envelope returned by an MCP `tools/call`. */
export interface ToolCallResult {
  content: unknown;
  isError: boolean;
  /** The typed result object, when the tool returns one (spec 2025-06-18). */
  structuredContent?: Record<string, unknown> | undefined;
  /**
   * Pages the user must open before the call can succeed: the server answered
   * with a URL-elicitation-required error (`-32042`, spec 2025-11-25).
   */
  urlElicitations?: UrlElicitation[] | undefined;
}

/** JSON-RPC 2.0 response shape (success or error). */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown | undefined;
  error?: { code: number | undefined; message: string; data?: unknown | undefined } | undefined;
}
