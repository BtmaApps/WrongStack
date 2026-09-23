import { resolveHttpBearerHeaders } from './client-process.js';

import type { MCPClientOptions, ToolsChangedListener } from './client-types.js';

import type { ConnectionState, MCPTool } from './contracts.js';

import type { ServerRequestResponder } from './elicitation.js';
import type { MCPServerMetadata } from './protocol.js';

import { type HttpTransportOptions, SSETransport, StreamableHTTPTransport } from './transport.js';

export interface ClientHttpConnectionHost {
  opts: MCPClientOptions;
  state: ConnectionState;
  sseTransport: SSETransport | undefined;
  disconnectListeners: Set<() => void>;
  _tools: MCPTool[];
  _toolsCache: MCPTool[] | undefined;
  toolsChangedListeners: Set<ToolsChangedListener>;
  emitCapabilityChanged: (capability: 'resources' | 'prompts') => void;
  emitResourceUpdated: (uri: string) => void;
  _serverMetadata: MCPServerMetadata | undefined;
  httpTransport: StreamableHTTPTransport | undefined;
  serverRequests: ServerRequestResponder;
}
export async function connectSSE(host: ClientHttpConnectionHost): Promise<void> {
  if (!host.opts.url) {
    host.state = 'failed';
    throw new Error('MCP SSE transport requires "url"');
  }
  const httpOpts: HttpTransportOptions = {
    name: host.opts.name,
    url: host.opts.url,
    headers: resolveHttpBearerHeaders(host.opts),
    startupTimeoutMs: host.opts.startupTimeoutMs,
    requestTimeoutMs: host.opts.requestTimeoutMs,
    authorizationProvider: host.opts.authorizationProvider,
    allowPrivateNetworks: host.opts.allowPrivateNetworks,
    serverRequests: host.serverRequests,
  };
  host.sseTransport = new SSETransport(httpOpts);
  host.sseTransport.onDisconnect(() => {
    host.state = 'disconnected';
    for (const cb of host.disconnectListeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  });
  host.sseTransport.onToolsChanged((tools) => {
    host._tools = tools;
    // Keep the reconnect-recovery cache in sync. Without this, an empty
    // tools update would leave `_toolsCache` pointing at the previous
    // non-empty list, and `listTools()` would serve the stale cache
    // (since it falls back to the cache when `_tools` is empty).
    host._toolsCache = tools;
    for (const cb of host.toolsChangedListeners) {
      try {
        cb(host.opts.name, tools);
      } catch {
        /* ignore */
      }
    }
  });
  host.sseTransport.onResourcesChanged(() => host.emitCapabilityChanged('resources'));
  host.sseTransport.onResourceUpdated((uri) => host.emitResourceUpdated(uri));
  host.sseTransport.onPromptsChanged(() => host.emitCapabilityChanged('prompts'));
  try {
    await host.sseTransport.connect();
  } catch (err) {
    // Tear down the partial transport deterministically: its SSE read
    // loop is async-running on a `ReadableStreamDefaultReader`, and its
    // `AbortController` is wired into the connect-time startup timer.
    // Without this close(), the reader can keep the response body alive
    // until GC. The transport is fresh (never reached the success
    // path), so close() is safe and idempotent.
    const t = host.sseTransport;
    host.sseTransport = undefined;
    await t.close().catch(() => {
      /* best-effort cleanup */
    });
    host.state = 'failed';
    throw err;
  }
  host._tools = host.sseTransport.listTools();
  host._toolsCache = host._tools;
  host._serverMetadata = host.sseTransport.getServerMetadata();
  host.state = 'connected';
}

export async function connectStreamableHTTP(host: ClientHttpConnectionHost): Promise<void> {
  if (!host.opts.url) {
    host.state = 'failed';
    throw new Error('MCP streamable-http transport requires "url"');
  }
  const httpOpts: HttpTransportOptions = {
    name: host.opts.name,
    url: host.opts.url,
    headers: resolveHttpBearerHeaders(host.opts),
    startupTimeoutMs: host.opts.startupTimeoutMs,
    requestTimeoutMs: host.opts.requestTimeoutMs,
    authorizationProvider: host.opts.authorizationProvider,
    allowPrivateNetworks: host.opts.allowPrivateNetworks,
    serverRequests: host.serverRequests,
  };
  host.httpTransport = new StreamableHTTPTransport(httpOpts);
  host.httpTransport.onDisconnect(() => {
    host.state = 'disconnected';
    for (const cb of host.disconnectListeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  });
  host.httpTransport.onToolsChanged((tools) => {
    host._tools = tools;
    // Same cache-sync reasoning as the SSE branch above — keep
    // `_toolsCache` in lockstep with `_tools` on every transport
    // update so the empty-list fallback in `listTools()` never serves
    // stale data.
    host._toolsCache = tools;
    for (const cb of host.toolsChangedListeners) {
      try {
        cb(host.opts.name, tools);
      } catch {
        /* ignore */
      }
    }
  });
  host.httpTransport.onResourcesChanged(() => host.emitCapabilityChanged('resources'));
  host.httpTransport.onResourceUpdated((uri) => host.emitResourceUpdated(uri));
  host.httpTransport.onPromptsChanged(() => host.emitCapabilityChanged('prompts'));
  try {
    await host.httpTransport.connect();
  } catch (err) {
    // Same teardown reasoning as the SSE branch — the partial transport's
    // `AbortController` and any in-flight header/state would otherwise
    // outlive this client instance until GC.
    const t = host.httpTransport;
    host.httpTransport = undefined;
    await t.close().catch(() => {
      /* best-effort cleanup */
    });
    host.state = 'failed';
    throw err;
  }
  host._tools = host.httpTransport.listTools();
  host._toolsCache = host._tools;
  host._serverMetadata = host.httpTransport.getServerMetadata();
  host.state = 'connected';
}
