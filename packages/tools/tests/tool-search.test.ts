import { describe, expect, it } from 'vitest';
import { kanbanTool } from '../src/kanban.js';
import { toolSearchTool } from '../src/tool-search.js';

const makeCtx = (tools: any[] = []) => ({ cwd: '/fake', tools, projectRoot: '/fake' }) as any;

const executeToolSearch = (
  input: Parameters<typeof toolSearchTool.execute>[0],
  ctx: Parameters<typeof toolSearchTool.execute>[1],
) => toolSearchTool.execute(input, ctx, { signal: new AbortController().signal });

describe('toolSearchTool', () => {
  it('has correct metadata', () => {
    expect(toolSearchTool.name).toBe('tool_search');
    expect(toolSearchTool.permission).toBe('auto');
    expect(toolSearchTool.mutating).toBe(false);
  });

  it('returns empty for no matches', async () => {
    const ctx = makeCtx([{ name: 'foo', description: 'Foo', permission: 'auto', mutating: false }]);
    const result = await executeToolSearch({ query: 'nonexistent' }, ctx);
    expect(result.tools).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('filters by name query', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'A foo tool', permission: 'auto', mutating: false },
      { name: 'bar', description: 'A bar tool', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch({ query: 'foo' }, ctx);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe('foo');
  });

  it('searches the lazy catalog rather than only the direct provider tools', async () => {
    const direct = [{ name: 'read', description: 'Read', permission: 'auto', mutating: false }];
    const lazy = {
      name: 'browser_open',
      description: 'Open browser',
      usageHint: 'Open a browser at the requested URL.',
      permission: 'auto',
      mutating: false,
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    };
    const ctx = { ...makeCtx(direct), catalogTools: [...direct, lazy] };
    const result = await executeToolSearch({ query: 'browser' }, ctx);
    expect(result.tools.map((tool) => tool.name)).toEqual(['browser_open']);
    expect(result.tools[0]).toMatchObject({
      usageHint: 'Open a browser at the requested URL.',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    });
  });

  it('returns the lazy Kanban action schema needed for tool_use', async () => {
    const ctx = { ...makeCtx([]), catalogTools: [kanbanTool] };
    const result = await executeToolSearch({ query: 'kanban' }, ctx);
    const schema = result.tools[0]?.inputSchema as {
      properties?: { action?: { enum?: string[] } };
    };

    expect(result.tools[0]?.name).toBe('kanban');
    expect(schema.properties?.action?.enum).toContain('workbench');
    expect(schema.properties?.action?.enum).toContain('create_board');
  });

  it('filters by description query', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'Does foo things', permission: 'auto', mutating: false },
      { name: 'bar', description: 'Does bar things', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch({ query: 'things' }, ctx);
    expect(result.total).toBe(2);
  });

  it('filters by permission', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'Foo', permission: 'auto', mutating: false },
      { name: 'bar', description: 'Bar', permission: 'deny', mutating: false },
    ]);
    const result = await executeToolSearch({ permission: 'deny' }, ctx);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe('bar');
  });

  it('filters by mutating flag', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'Foo', permission: 'auto', mutating: false },
      { name: 'bar', description: 'Bar', permission: 'auto', mutating: true },
    ]);
    const result = await executeToolSearch({ mutating: false }, ctx);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe('foo');
  });

  it('makes category and capability tags discoverable and filterable', async () => {
    const ctx = makeCtx([
      {
        name: 'codebase-search',
        description: 'Search indexed declarations',
        category: 'Project',
        capabilities: ['codebase.search'],
        permission: 'auto',
        mutating: false,
      },
      {
        name: 'write',
        description: 'Write a file',
        category: 'Filesystem',
        permission: 'confirm',
        mutating: true,
      },
    ]);

    const result = await executeToolSearch({ tags: ['codebase'] }, ctx);

    expect(result.tools).toEqual([
      expect.objectContaining({
        name: 'codebase-search',
        category: 'Project',
        capabilities: ['codebase.search'],
      }),
    ]);
  });

  it('does not claim that a default empty search lists every tool', async () => {
    const ctx = makeCtx([
      { name: 'read', description: 'Read', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch({ query: 'missing' }, ctx);

    expect(result.hint).toContain('limit up to 100');
    expect(result.hint).not.toContain('list them all');
  });

  it('respects limit', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'Foo', permission: 'auto', mutating: false },
      { name: 'bar', description: 'Bar', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch({ limit: 1 }, ctx);
    expect(result.tools).toHaveLength(1);
    // truncated is true when filtered.length > limit
    expect(result.truncated).toBe(true);
  });

  it('caps limit at 100', async () => {
    const ctx = makeCtx([{ name: 'foo', description: 'Foo', permission: 'auto', mutating: false }]);
    const result = await executeToolSearch({ limit: 999 }, ctx as any);
    expect(result.tools).toHaveLength(1);
  });

  it('combines all filters', async () => {
    const ctx = makeCtx([
      { name: 'foo', description: 'A foo tool', permission: 'auto', mutating: false },
      { name: 'bar', description: 'A bar tool', permission: 'confirm', mutating: true },
    ]);
    const result = await executeToolSearch({ query: 'foo', mutating: false }, ctx);
    expect(result.tools).toHaveLength(1);
  });

  it('finds a tool from a phrase a model writes, ranking the name match first', async () => {
    const ctx = makeCtx([
      {
        name: 'write',
        description: 'Write a file at a path',
        permission: 'confirm',
        mutating: true,
      },
      {
        name: 'image_generate',
        description: 'Generate an image from a text prompt and save it into the project.',
        usageHint: 'Give a prompt and a project-relative path.',
        permission: 'confirm',
        mutating: true,
      },
      { name: 'grep', description: 'Search file contents', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch(
      { query: 'image_generate generate image with prompt and path' },
      ctx,
    );
    expect(result.tools.map((t) => t.name)).toEqual(['image_generate']);

    const loose = await executeToolSearch({ query: 'save image file' }, ctx);
    expect(loose.tools[0]?.name).toBe('image_generate');
  });

  it('says when the filters, not the query, emptied the result', async () => {
    const ctx = makeCtx([
      {
        name: 'image_generate',
        description: 'Generate an image',
        permission: 'confirm',
        mutating: true,
      },
    ]);
    const result = await executeToolSearch({ query: 'image_generate', permission: 'auto' }, ctx);
    expect(result.tools).toEqual([]);
    expect(result.hint).toContain(
      '1 tool(s) match "image_generate" but the tags/permission/mutating filters excluded them',
    );

    const none = await executeToolSearch({ query: 'nothing-like-this', permission: 'auto' }, ctx);
    expect(none.hint).toContain('No tools matched');
  });

  it('keeps a literal match ahead of word matches', async () => {
    const ctx = makeCtx([
      {
        name: 'notes',
        description: 'Keep project notes and a list of todos',
        permission: 'auto',
        mutating: false,
      },
      { name: 'todo', description: 'Track the todo list', permission: 'auto', mutating: false },
    ]);
    const result = await executeToolSearch({ query: 'todo list' }, ctx);
    expect(result.tools.map((t) => t.name)).toEqual(['todo', 'notes']);
  });

  it('does not match on stop words alone', async () => {
    const ctx = makeCtx([
      {
        name: 'foo',
        description: 'Use this tool with the data',
        permission: 'auto',
        mutating: false,
      },
    ]);
    const result = await executeToolSearch({ query: 'use the tool with a bar' }, ctx);
    expect(result.tools).toEqual([]);
  });
});
