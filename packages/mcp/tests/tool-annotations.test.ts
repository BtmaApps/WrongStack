/**
 * Tool `annotations` (spec 2025-03-26, unchanged in 2026-07-28), both directions.
 *
 * Field names and defaults verified against the schema itself, not from memory:
 * `schema/2025-03-26/schema.ts` and `schema/2026-07-28/schema.ts` both declare
 * exactly `title`, `readOnlyHint` (default false), `destructiveHint`
 * (default true), `idempotentHint` (default false) and `openWorldHint`
 * (default true).
 *
 * The spec is explicit that a client MUST treat these as untrusted claims, so
 * the client side keeps the five known keys with their declared types and
 * nothing else — an adversarial server cannot smuggle payload into surfaces
 * that render this.
 */
import { describe, expect, it } from 'vitest';
import { MCPServer } from '../src/server.js';
import { normalizeMCPTools } from '../src/tool-schema.js';

describe('client: tools/list annotations carry-through', () => {
  it('carries a well-formed annotations block', () => {
    const [tool] = normalizeMCPTools([
      {
        name: 'kanban_destructive',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          title: 'Delete board',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ]);
    expect(tool?.annotations).toEqual({
      title: 'Delete board',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it('keeps hints alone when no title is present', () => {
    const [tool] = normalizeMCPTools([
      {
        name: 'read',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
      },
    ]);
    expect(tool?.annotations).toEqual({ readOnlyHint: true });
  });

  it('drops unknown keys, mistyped hints and an empty title', () => {
    const [tool] = normalizeMCPTools([
      {
        name: 'hostile',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          title: '',
          readOnlyHint: 'yes',
          destructiveHint: 1,
          exfiltrate: { secrets: true },
        },
      },
    ]);
    expect(tool?.annotations).toBeUndefined();
  });

  it('ignores a non-object annotations block', () => {
    const [tool] = normalizeMCPTools([
      { name: 'a', inputSchema: {}, annotations: ['readOnlyHint'] },
      { name: 'b', inputSchema: {}, annotations: 'readOnly=true' },
    ]);
    expect(tool?.annotations).toBeUndefined();
  });

  it('omits the field entirely when the server sends no annotations', () => {
    const [tool] = normalizeMCPTools([{ name: 'plain', inputSchema: {} }]);
    expect(tool && 'annotations' in tool).toBe(false);
  });

  it('bounds an oversized hostile title', () => {
    const [tool] = normalizeMCPTools([
      {
        name: 'long',
        inputSchema: {},
        annotations: { title: 'x'.repeat(5000) },
      },
    ]);
    expect(tool?.annotations?.title).toHaveLength(512);
  });
});

describe('server: tools/list publishes annotations', () => {
  it('advertises the host tool annotations verbatim', async () => {
    const server = new MCPServer({
      host: {
        listTools: () => [
          {
            name: 'kanban_destructive',
            description: 'Deletes durable Kanban state.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: false, destructiveHint: true },
          },
        ],
        callTool: async () => ({ content: 'ok', isError: false }),
      },
    });
    const raw = await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    );
    const parsed = JSON.parse(raw ?? '') as {
      result: { tools: { name: string; annotations?: Record<string, unknown> }[] };
    };
    expect(parsed.result.tools[0]?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('publishes no annotations key for a tool that declares none', async () => {
    const server = new MCPServer({
      host: {
        listTools: () => [{ name: 'plain', inputSchema: { type: 'object', properties: {} } }],
        callTool: async () => ({ content: 'ok', isError: false }),
      },
    });
    const raw = await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    );
    const parsed = JSON.parse(raw ?? '') as { result: { tools: Record<string, unknown>[] } };
    expect('annotations' in (parsed.result.tools[0] ?? {})).toBe(false);
  });
});
