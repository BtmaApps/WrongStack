import { codebaseSearchTool } from '@wrongstack/tools/codebase-index';
import { describe, expect, it, vi } from 'vitest';
import { createCodebaseIndexMcpServer, createCodebaseIndexMcpToolHost } from '../src/adapter.js';

describe('createCodebaseIndexMcpToolHost', () => {
  it('advertises read-only IPC queries by default and hides LSP-only input', async () => {
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      dependencies: { executeTool: vi.fn() },
    });
    const tools = await host.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'codebase_context',
      'codebase_search',
      'codebase_stats',
      'codebase_package_graph',
      'codebase_file_graph',
      'codebase_symbol_graph',
      'codebase_incoming_calls',
      'codebase_outgoing_calls',
      'codebase_read_symbol',
      'codebase_skeleton',
      'codebase_impact_analysis',
      'codebase_repo_map',
    ]);
    const search = tools[1]!.inputSchema as { properties: Record<string, unknown> };
    expect(search.properties).not.toHaveProperty('preferLsp');
  });

  it('answers who-calls and what-calls through the compact call-graph tools', async () => {
    const executeTool = vi.fn().mockResolvedValue({ symbol: 'start', callSites: [] });
    const host = createCodebaseIndexMcpToolHost('C:/project', { dependencies: { executeTool } });

    for (const name of ['codebase_incoming_calls', 'codebase_outgoing_calls']) {
      await expect(host.callTool(name, { symbol: 'start', limit: 5 })).resolves.toMatchObject({
        isError: false,
      });
      await expect(host.callTool(name, {})).resolves.toEqual({
        content: `${name} requires a non-empty string "symbol"`,
        isError: true,
      });
    }
    const toolNames = executeTool.mock.calls.map((call) => (call[0] as { name: string }).name);
    expect(toolNames).toEqual(['codebase-incoming-calls', 'codebase-outgoing-calls']);
    expect(executeTool.mock.calls[0]![1]).toEqual({ symbol: 'start', limit: 5 });
  });

  it('serves symbol source, outlines, impact and the repo map from the index tools', async () => {
    const executeTool = vi.fn().mockResolvedValue({ ok: true });
    const host = createCodebaseIndexMcpToolHost('C:/project', { dependencies: { executeTool } });

    const calls: Array<[string, Record<string, unknown>]> = [
      ['codebase_read_symbol', { file: 'src/a.ts', symbol: 'run' }],
      ['codebase_skeleton', { path: 'src' }],
      ['codebase_impact_analysis', { symbol: 'run' }],
      ['codebase_repo_map', {}],
    ];
    for (const [name, args] of calls) {
      await expect(host.callTool(name, args)).resolves.toMatchObject({ isError: false });
    }
    expect(executeTool.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual([
      'codebase-read-symbol',
      'codebase-skeleton',
      'codebase-impact-analysis',
      'codebase-repo-map',
    ]);
    // Required fields come from each tool's own schema.
    await expect(host.callTool('codebase_read_symbol', { file: 'src/a.ts' })).resolves.toEqual({
      content: 'codebase_read_symbol requires a non-empty string "symbol"',
      isError: true,
    });
    await expect(host.callTool('codebase_skeleton', { path: ' ' })).resolves.toMatchObject({
      isError: true,
    });
  });

  it('executes canonical index tools with project and index directory context', async () => {
    const executeTool = vi.fn().mockResolvedValue({ total: 1, results: [{ name: 'Thing' }] });
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      indexDir: 'C:/index',
      dependencies: { executeTool },
    });

    await expect(host.callTool('codebase_search', { query: 'Thing' })).resolves.toMatchObject({
      isError: false,
      content: { total: 1 },
    });
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codebase-search' }),
      { query: 'Thing' },
      expect.objectContaining({
        projectRoot: 'C:/project',
        meta: expect.objectContaining({ codebaseIndexDir: 'C:/index' }),
      }),
      expect.any(AbortSignal),
    );
  });

  it('forwards the MCP request cancellation signal to canonical tools', async () => {
    const executeTool = vi.fn().mockResolvedValue({ total: 0, results: [] });
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      dependencies: { executeTool },
    });
    const controller = new AbortController();

    await host.callTool('codebase_search', { query: 'Thing' }, { signal: controller.signal });

    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'codebase-search' }),
      { query: 'Thing' },
      expect.anything(),
      controller.signal,
    );
  });

  it('reports a degraded codebase_context failure as an MCP error', async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValue({ query: 'x', entries: [], indexStatus: 'error', error: 'db locked' });
    const host = createCodebaseIndexMcpToolHost('C:/project', { dependencies: { executeTool } });

    await expect(host.callTool('codebase_context', { query: 'x' })).resolves.toMatchObject({
      isError: true,
      content: { error: 'db locked' },
    });
    executeTool.mockResolvedValue({ query: 'x', entries: [], indexStatus: 'no-matches' });
    await expect(host.callTool('codebase_context', { query: 'x' })).resolves.toMatchObject({
      isError: false,
    });
  });

  it('routes graph reads through the project service dependencies', async () => {
    const packageGraph = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
    const fileGraph = vi.fn().mockResolvedValue({ nodes: [{ id: 'a' }], edges: [] });
    const symbolGraph = vi.fn().mockResolvedValue({ nodes: [{ id: 'b' }], edges: [] });
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      indexDir: 'C:/index',
      dependencies: { executeTool: vi.fn(), packageGraph, fileGraph, symbolGraph },
    });
    const controller = new AbortController();

    await expect(
      host.callTool('codebase_package_graph', {}, { signal: controller.signal }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      host.callTool(
        'codebase_file_graph',
        { package: '@wrongstack/core' },
        { signal: controller.signal },
      ),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      host.callTool(
        'codebase_symbol_graph',
        { file: 'packages/core/src/index.ts' },
        { signal: controller.signal },
      ),
    ).resolves.toMatchObject({ isError: false });

    expect(packageGraph).toHaveBeenCalledWith(
      { projectRoot: 'C:/project', indexDir: 'C:/index' },
      controller.signal,
    );
    expect(fileGraph).toHaveBeenCalledWith(
      {
        projectRoot: 'C:/project',
        indexDir: 'C:/index',
        packageFilter: '@wrongstack/core',
      },
      controller.signal,
    );
    expect(symbolGraph).toHaveBeenCalledWith(
      {
        projectRoot: 'C:/project',
        indexDir: 'C:/index',
        fileFilter: 'packages/core/src/index.ts',
      },
      controller.signal,
    );
  });

  it('rejects hidden writers and malformed required inputs', async () => {
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      dependencies: { executeTool: vi.fn() },
    });
    await expect(host.callTool('codebase_index', {})).resolves.toMatchObject({ isError: true });
    await expect(host.callTool('codebase_search', {})).resolves.toEqual({
      content: 'codebase_search requires a non-empty string "query"',
      isError: true,
    });
    await expect(host.callTool('codebase_file_graph', {})).resolves.toMatchObject({
      isError: true,
    });
  });

  it('exposes the index writer in writable mode and converts failures to MCP errors', async () => {
    const executeTool = vi.fn().mockRejectedValue(new Error('daemon failed'));
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      writable: true,
      dependencies: { executeTool },
    });
    expect((await host.listTools()).map((tool) => tool.name)).toContain('codebase_index');
    await expect(host.callTool('codebase_index', { force: false })).resolves.toEqual({
      content: 'daemon failed',
      isError: true,
    });
  });

  it('validates symbol graph file, codebase_index force/langs, builtin.validate, trimmed graph filters, post-await aborts, and non-Error throws', async () => {
    const fileGraph = vi.fn().mockResolvedValue({ ok: true });
    const symbolGraph = vi.fn().mockResolvedValue({ ok: true });
    const executeTool = vi.fn().mockRejectedValue('raw string failure');
    const host = createCodebaseIndexMcpToolHost('C:/project', {
      writable: true,
      dependencies: {
        executeTool,
        fileGraph,
        symbolGraph,
      },
    });

    // S13-M1: codebase_symbol_graph missing/blank file
    await expect(host.callTool('codebase_symbol_graph', { file: '   ' })).resolves.toEqual({
      content: 'codebase_symbol_graph requires a non-empty string "file"',
      isError: true,
    });

    // S13-M2 & S13-M3: codebase_index force & langs validation
    await expect(host.callTool('codebase_index', { force: 'yes' })).resolves.toEqual({
      content: 'codebase_index "force" must be a boolean',
      isError: true,
    });
    await expect(host.callTool('codebase_index', { langs: [123] })).resolves.toEqual({
      content: 'codebase_index "langs" must be an array of language strings',
      isError: true,
    });

    // S13-M4: builtin.validate(args) failure stops before executeTool is called
    const prevValidate = codebaseSearchTool.validate;
    (codebaseSearchTool as { validate?: unknown }).validate = () => ['limit must be >= 1'];
    try {
      const invalidRes = await host.callTool('codebase_search', { query: 'foo', limit: -5 });
      expect(invalidRes).toEqual({
        content: 'limit must be >= 1',
        isError: true,
      });
      expect(executeTool).not.toHaveBeenCalled();
    } finally {
      (codebaseSearchTool as { validate?: unknown }).validate = prevValidate;
    }

    // S13-M5 & S13-M6: .trim() on packageFilter and fileFilter
    await host.callTool('codebase_file_graph', { package: '  @wrongstack/core  ' });
    expect(fileGraph).toHaveBeenCalledWith(
      { projectRoot: 'C:/project', packageFilter: '@wrongstack/core' },
      expect.any(AbortSignal),
    );
    await host.callTool('codebase_symbol_graph', { file: '  src/index.ts  ' });
    expect(symbolGraph).toHaveBeenCalledWith(
      { projectRoot: 'C:/project', fileFilter: 'src/index.ts' },
      expect.any(AbortSignal),
    );

    // S13-M10: non-Error thrown value formatted via String(error)
    await expect(host.callTool('codebase_stats', {})).resolves.toEqual({
      content: 'raw string failure',
      isError: true,
    });

    // S13-M7, S13-M8, S13-M9: post-await signal.throwIfAborted() on package/file/symbol graphs
    for (const [toolName, toolArgs] of [
      ['codebase_package_graph', {}],
      ['codebase_file_graph', { package: 'pkg' }],
      ['codebase_symbol_graph', { file: 'f.ts' }],
    ] as const) {
      const ctrl = new AbortController();
      const abortAfterResolve = vi.fn(async () => {
        ctrl.abort(new Error(`aborted:${toolName}`));
        return { graph: true };
      });
      const graphHost = createCodebaseIndexMcpToolHost('C:/project', {
        dependencies: {
          packageGraph: abortAfterResolve,
          fileGraph: abortAfterResolve,
          symbolGraph: abortAfterResolve,
        },
      });
      await expect(
        graphHost.callTool(toolName, toolArgs, { signal: ctrl.signal }),
      ).resolves.toEqual({
        content: `aborted:${toolName}`,
        isError: true,
      });
    }
  });
});

describe('createCodebaseIndexMcpServer', () => {
  it('publishes server identity and the exploration prompt', async () => {
    const server = createCodebaseIndexMcpServer('C:/project', {
      dependencies: { executeTool: vi.fn() },
    });
    const initialized = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      ))!,
    ) as { result: { serverInfo: { name: string }; instructions?: string } };
    expect(initialized.result.serverInfo.name).toBe('wrongstack-codebase-index-mcp');
    // Shown to the client even while tools sit behind a tool search.
    expect(initialized.result.instructions).toMatch(/before grep\/glob/);

    const listed = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }),
      ))!,
    ) as { result: { tools: Array<{ name: string; _meta?: Record<string, unknown> }> } };
    const upfront = listed.result.tools
      .filter((tool) => tool._meta?.['anthropic/alwaysLoad'] === true)
      .map((tool) => tool.name);
    expect(upfront).toEqual(['codebase_search', 'codebase_incoming_calls', 'codebase_read_symbol']);

    const prompts = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/list', params: {} }),
      ))!,
    ) as { result: { prompts: Array<{ name: string }> } };
    expect(prompts.result.prompts).toContainEqual(
      expect.objectContaining({ name: 'explore-codebase' }),
    );
  });

  it('propagates JSON-RPC cancellation into a running index tool', async () => {
    let observedSignal: AbortSignal | undefined;
    let started!: () => void;
    const toolStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const server = createCodebaseIndexMcpServer('C:/project', {
      dependencies: {
        executeTool: vi.fn(async (_tool, _args, _context, signal) => {
          observedSignal = signal;
          started();
          await new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        }),
      },
    });

    const pending = server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'codebase_search', arguments: { query: 'slow' } },
      }),
    );
    await toolStarted;
    await expect(
      server.handleMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 7, reason: 'client stopped' },
        }),
      ),
    ).resolves.toBeNull();

    expect(observedSignal?.aborted).toBe(true);
    await expect(pending).resolves.toContain('client stopped');
  });
});
