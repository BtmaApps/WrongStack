import type { MCPAuthorizationProvider } from './authorization.js';

import type { MCPTool } from './contracts.js';

export type Transport = 'stdio' | 'sse' | 'streamable-http';

export interface MCPClientOptions {
  name: string;
  transport: Transport;
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  url?: string | undefined;
  headers?: Record<string, string> | undefined;
  /** Resolve an HTTP Bearer token from this environment variable at connect time. */
  bearerTokenEnv?: string | undefined;
  startupTimeoutMs?: number | undefined;
  requestTimeoutMs?: number | undefined;
  /**
   * Working directory for a stdio server process. Presets address the project
   * as `--project-root .` / `server-filesystem .`, which resolve against the
   * spawn cwd — without this the child inherited WrongStack's PROCESS cwd, so
   * a host serving a project from elsewhere (WebUI, ACP sessions with their
   * own cwd) pointed those servers at the wrong directory.
   */
  cwd?: string | undefined;
  /** Host-owned, vault-backed authorization for HTTP transports. */
  authorizationProvider?: MCPAuthorizationProvider | undefined;
  /**
   * Allowlist of env var names to forward from the parent process (process.env)
   * to the child. Values are resolved at spawn time and merged into `env`
   * via the `extra` path of `buildChildEnv` (unfiltered). This is how built-in
   * MCP server presets (GitHub, Slack, Brave Search, …) get their API tokens
   * without storing them in config.json or being scrubbed by the secret filter.
   */
  passthroughEnv?: string[] | undefined;
  /**
   * Resolution-bound private-network policy for HTTP transports. Default:
   * private/LAN targets are blocked at dial time (DNS-rebinding safe); the
   * flag opts this server in. See MCPServerConfig.allowPrivateNetworks.
   */
  allowPrivateNetworks?: boolean | undefined;
}

export interface MCPRequestOptions {
  signal?: AbortSignal | undefined;
}

export interface MCPPageOptions extends MCPRequestOptions {
  cursor?: string | undefined;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown | undefined;
}

export type JsonRpcServerRequest = {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown | undefined;
};

export type ExitListener = (name: string, code: number | null, signal: string | null) => void;
export type ToolsChangedListener = (name: string, tools: MCPTool[]) => void;
export type MCPListChangedListener = (name: string) => void;
