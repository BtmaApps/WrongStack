/**
 * Additional tests for wrapMCPTool — covering error paths, content variants,
 * and schema-based mutating detection.
 */
import { describe, expect, it, vi } from 'vitest';
import type { MCPClient, MCPTool } from '../src/client.js';
import { wrapMCPTool } from '../src/wrap-tool.js';

const mkClient = (callImpl: (name: string, input: unknown) => Promise<unknown>) =>
  ({
    callTool: vi.fn(async (name: string, input: unknown) => {
      const out = await callImpl(name, input);
      return { content: out, isError: false };
    }),
  }) as never as MCPClient;

const ctx = {} as Parameters<ReturnType<typeof wrapMCPTool>['execute']>[1];
const opts = { signal: new AbortController().signal };

describe('wrapMCPTool - extra coverage', () => {
  it('throws when response has isError=true', async () => {
    const errClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'something broke' }],
        isError: true,
      }),
    } as never as MCPClient;
    const wrapped = wrapMCPTool(
      's',
      { name: 'failing', inputSchema: { type: 'object' } },
      errClient,
    );
    await expect(wrapped.execute({}, ctx, opts)).rejects.toThrow('something broke');
  });

  it('detects mutating via inputSchema property names', () => {
    const wrapped = wrapMCPTool(
      'db',
      {
        name: 'query',
        inputSchema: { type: 'object', properties: { deleteTable: { type: 'string' } } },
      },
      mkClient(async () => 'ok'),
    );
    expect(wrapped.mutating).toBe(true);
  });

  it('detects non-mutating via inputSchema property names', () => {
    const wrapped = wrapMCPTool(
      'db',
      {
        name: 'query',
        inputSchema: { type: 'object', properties: { selectFrom: { type: 'string' } } },
      },
      mkClient(async () => 'ok'),
    );
    expect(wrapped.mutating).toBe(false);
  });

  it('stringifies mixed content items', async () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'mixed', inputSchema: { type: 'object' } },
      mkClient(async () => [
        { type: 'text', text: 'line1' },
        { type: 'resource', resource: { uri: 'file:///x' } },
        42,
      ]),
    );
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toContain('line1');
    expect(out).toContain('resource');
  });

  it('stringifies single text object', async () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'simple-text', inputSchema: { type: 'object' } },
      mkClient(async () => ({ type: 'text', text: 'hello world' })),
    );
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toBe('hello world');
  });

  it('uses qualified name as description when description is missing', () => {
    const mcpTool: MCPTool = { name: 'bare-tool', inputSchema: { type: 'object' } };
    delete (mcpTool as any).description;
    const wrapped = wrapMCPTool(
      'server',
      mcpTool,
      mkClient(async () => 'ok'),
    );
    expect(wrapped.description).toContain('mcp__server__bare-tool');
  });

  it('resolves lazy client function', async () => {
    const lazyClient = vi
      .fn()
      .mockResolvedValue(mkClient(async () => 'lazy-result') as never as MCPClient);
    const wrapped = wrapMCPTool('s', { name: 'lazy', inputSchema: { type: 'object' } }, lazyClient);
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toBe('lazy-result');
    expect(lazyClient).toHaveBeenCalled();
  });

  it('handles null inputSchema (falls back to empty)', () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'no-schema', inputSchema: null as any },
      mkClient(async () => 'ok'),
    );
    expect(wrapped.inputSchema).toEqual({ type: 'object', properties: {} });
    expect(wrapped.mutating).toBe(false);
  });

  it('handles undefined inputSchema properties', () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'no-props', inputSchema: { type: 'object' } },
      mkClient(async () => 'ok'),
    );
    expect(wrapped.mutating).toBe(false);
  });

  it('stringifies resource content items (non-text)', async () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'resource', inputSchema: { type: 'object' } },
      mkClient(async () => [
        { type: 'resource', resource: { uri: 'file:///data.txt', mimeType: 'text/plain' } },
      ]),
    );
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toContain('resource');
  });

  // Regression: image/audio blocks were JSON-stringified whole, dumping raw
  // base64 into the model context.
  it('summarizes binary content blocks instead of inlining base64', async () => {
    const base64 = 'A'.repeat(8_000);
    const wrapped = wrapMCPTool(
      's',
      { name: 'shot', inputSchema: { type: 'object' } },
      mkClient(async () => [
        { type: 'text', text: 'caption' },
        { type: 'image', mimeType: 'image/png', data: base64 },
        { type: 'audio', mimeType: 'audio/wav', data: base64 },
        { type: 'resource', resource: { uri: 'file:///notes.md', text: 'readable body' } },
        {
          type: 'resource',
          resource: { uri: 'file:///bin', mimeType: 'application/zip', blob: base64 },
        },
        { type: 'resource_link', uri: 'file:///linked' },
      ]),
    );
    const out = String(await wrapped.execute({}, ctx, opts));
    expect(out).not.toContain(base64);
    expect(out).toContain('caption');
    expect(out).toContain('[image content: image/png, ~6 KB');
    expect(out).toContain('[audio content: audio/wav');
    expect(out).toContain('[resource file:///notes.md]\nreadable body');
    expect(out).toContain('[resource file:///bin: application/zip, binary payload not inlined]');
    expect(out).toContain('[resource link: file:///linked]');
  });

  it('stringifies items without type field as JSON', async () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'raw', inputSchema: { type: 'object' } },
      mkClient(async () => [{ data: 'value', count: 42 }]),
    );
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toContain('value');
  });

  it('handles text type item with missing text field', async () => {
    const wrapped = wrapMCPTool(
      's',
      { name: 'empty-text', inputSchema: { type: 'object' } },
      mkClient(async () => [{ type: 'text' }]),
    );
    const out = await wrapped.execute({}, ctx, opts);
    expect(out).toBe('');
  });
});
