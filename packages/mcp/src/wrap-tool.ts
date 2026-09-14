import { ToolCapabilities } from '@wrongstack/core/security';
import type { Permission, Tool } from '@wrongstack/core/types';
import { mcpQualifiedToolName } from '@wrongstack/core/utils';
import type { MCPClient } from './client.js';
import type { MCPTool } from './contracts.js';

/**
 * Keywords that indicate a mutating operation.
 * Applied to both the tool name and its inputSchema property names.
 */
const MUTATING_RE = /create|update|delete|write|send|set|put|post|patch|remove|rename|move/i;

function isMutatingTool(mcpTool: MCPTool): boolean {
  if (MUTATING_RE.test(mcpTool.name)) return true;
  // Check property names in the input schema for mutating intent.
  // e.g. { properties: { createTable: {...}, dropIndex: {...} } }
  const schema = mcpTool.inputSchema;
  if (schema && typeof schema === 'object') {
    const props = (schema as { properties?: Record<string, unknown> }).properties;
    if (props) {
      for (const key of Object.keys(props)) {
        if (MUTATING_RE.test(key)) return true;
      }
    }
  }
  return false;
}

/**
 * Resolves the live client for a tool call. A plain {@link MCPClient} for eager
 * servers, or a thunk that connects-on-demand for lazy/dormant servers (the
 * registry passes `() => this.ensureConnected(name)`).
 */
export type MCPClientResolver = MCPClient | (() => Promise<MCPClient>);

export interface MCPToolCallObserver {
  onStart(): void;
  onFinish(result: { durationMs: number; ok: boolean }): void;
}

export function wrapMCPTool(
  serverName: string,
  mcpTool: MCPTool,
  client: MCPClientResolver,
  permission: Permission = 'confirm',
  observer?: MCPToolCallObserver | undefined,
): Tool {
  // Sanitized to the provider-wire pattern ^[a-zA-Z0-9_-]{1,128}$ — server
  // names and remote tool names may contain dots/colons/spaces that
  // Anthropic-family endpoints reject with a 400. The remote call below
  // still uses the original `mcpTool.name`.
  const qualifiedName = mcpQualifiedToolName(serverName, mcpTool.name);
  return {
    name: qualifiedName,
    description: mcpTool.description ?? `${qualifiedName} (MCP tool)`,
    usageHint: `Tool provided by MCP server "${serverName}". ${mcpTool.description ?? ''}`,
    permission,
    mutating: isMutatingTool(mcpTool),
    capabilities: [ToolCapabilities.MCP_PROXY],
    inputSchema: mcpTool.inputSchema ?? { type: 'object', properties: {} },
    async execute(input, ctx, opts) {
      const startedAt = Date.now();
      observer?.onStart();
      let ok = false;
      try {
        // For a dormant lazy server this spawns the process + handshakes before
        // the first call; for an eager server it resolves to the fixed client.
        const live = typeof client === 'function' ? await client() : client;
        // Propagate the run's abort signal: on Ctrl+C the JSON-RPC request is
        // dropped AND the server is told via `notifications/cancelled` to stop
        // the in-flight work, instead of it running to completion server-side.
        const signal = opts?.signal ?? ctx?.signal;
        const res = await live.callTool(mcpTool.name, input, signal ? { signal } : undefined);
        if (res.isError) {
          const errText = stringify(res.content);
          throw new Error(errText || `MCP tool "${qualifiedName}" failed`);
        }
        ok = true;
        return stringify(res.content);
      } finally {
        observer?.onFinish({ durationMs: Date.now() - startedAt, ok });
      }
    },
  };
}

/**
 * Render one MCP content block as model-facing text.
 *
 * Non-text blocks used to be JSON-stringified whole, so an `image`/`audio`
 * block landed in the context as megabytes of base64 the model cannot read —
 * burning the window and tripping truncation for nothing. Binary payloads are
 * summarized; embedded resource TEXT is kept because it is readable content.
 */
function renderContentBlock(item: Record<string, unknown>): string {
  const type = item['type'];
  if (type === 'text') return typeof item['text'] === 'string' ? item['text'] : '';
  if (type === 'image' || type === 'audio') {
    const mime = typeof item['mimeType'] === 'string' ? item['mimeType'] : 'unknown type';
    const data = typeof item['data'] === 'string' ? item['data'] : '';
    const kb = Math.max(1, Math.round((data.length * 3) / 4 / 1024));
    return `[${type} content: ${mime}, ~${kb} KB — binary payload not inlined]`;
  }
  if (type === 'resource' && item['resource'] && typeof item['resource'] === 'object') {
    const resource = item['resource'] as Record<string, unknown>;
    const uri = typeof resource['uri'] === 'string' ? resource['uri'] : 'unknown';
    if (typeof resource['text'] === 'string') return `[resource ${uri}]\n${resource['text']}`;
    if (typeof resource['blob'] === 'string') {
      const mime = typeof resource['mimeType'] === 'string' ? `${resource['mimeType']}, ` : '';
      return `[resource ${uri}: ${mime}binary payload not inlined]`;
    }
    return JSON.stringify(item);
  }
  if (type === 'resource_link' && typeof item['uri'] === 'string') {
    return `[resource link: ${item['uri']}]`;
  }
  return JSON.stringify(item);
}

function stringify(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((item) => {
        if (item && typeof item === 'object') {
          return renderContentBlock(item as Record<string, unknown>);
        }
        return String(item);
      })
      .join('\n');
  }
  if (c && typeof c === 'object') {
    if ('text' in (c as Record<string, unknown>)) {
      return String((c as Record<string, unknown>).text);
    }
    return JSON.stringify(c);
  }
  return String(c ?? '');
}
