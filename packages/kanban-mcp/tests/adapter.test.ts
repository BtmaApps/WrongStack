import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBoard, type KanbanServerEvent, type KanbanTask } from '@wrongstack/kanban';
import { addCheckToTask, addGoalMetricToTask, addTask } from '@wrongstack/kanban/test-support';
// Namespace import: vitest resolves this to the tools SOURCE, while the test
// tsconfig resolves it to the built dist, which may predate the export.
import * as kanbanToolModule from '@wrongstack/tools/kanban';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKanbanMcpServer, createKanbanMcpToolHost } from '../src/adapter.js';
import { KANBAN_READ_ACTIONS } from '../src/policy.js';

describe('createKanbanMcpToolHost', () => {
  it('advertises action-filtered schemas for each enabled tier', async () => {
    const host = createKanbanMcpToolHost('C:/project', {
      writable: true,
      dependencies: { executeKanban: vi.fn() },
    });
    const tools = await host.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'kanban_read',
      'kanban_watch',
      'kanban_manage',
    ]);
    const readSchema = tools[0]!.inputSchema as {
      properties: { action: { enum: string[] } };
    };
    expect(readSchema.properties.action.enum).toContain('get_board');
    expect(readSchema.properties.action.enum).not.toContain('update_task');
  });

  it('executes an allowed action with project and actor context', async () => {
    const executeKanban = vi.fn().mockResolvedValue({ ok: true, boards: [] });
    const host = createKanbanMcpToolHost('C:/project', {
      actor: 'cursor-agent',
      dependencies: { executeKanban },
    });
    const result = await host.callTool('kanban_read', { action: 'list_boards' });
    expect(result).toEqual({ content: { ok: true, boards: [] }, isError: false });
    expect(executeKanban).toHaveBeenCalledWith(
      { action: 'list_boards' },
      expect.objectContaining({ projectRoot: 'C:/project', agentId: 'cursor-agent' }),
      expect.any(AbortSignal),
    );
  });

  it('forwards the MCP request cancellation signal to Kanban actions', async () => {
    const executeKanban = vi.fn().mockResolvedValue({ ok: true, boards: [] });
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: { executeKanban },
    });
    const controller = new AbortController();

    await host.callTool('kanban_read', { action: 'list_boards' }, { signal: controller.signal });

    expect(executeKanban).toHaveBeenCalledWith(
      { action: 'list_boards' },
      expect.anything(),
      controller.signal,
    );
  });

  it('rejects hidden tools and cross-tier actions', async () => {
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: { executeKanban: vi.fn() },
    });
    await expect(host.callTool('kanban_manage', { action: 'update_task' })).resolves.toMatchObject({
      isError: true,
    });
    await expect(host.callTool('kanban_read', { action: 'delete_board' })).resolves.toMatchObject({
      isError: true,
    });
  });

  it('surfaces Kanban failures and thrown errors as MCP errors', async () => {
    // The kanban tool THROWS on failure (it never returns ok:false); the thrown
    // error carries a stable code, retryability and lifecycle issues, and all
    // of it must reach the MCP client.
    const issues = [{ code: 'missing-owner', field: 'assignee', message: 'Assign an owner.' }];
    const failedHost = createKanbanMcpToolHost('C:/project', {
      dependencies: {
        executeKanban: vi.fn().mockRejectedValue(
          Object.assign(new Error('[REFUSED] Cannot start. Issues: assignee: Assign an owner.'), {
            kanbanCode: 'REFUSED',
            retryable: false,
            issues,
          }),
        ),
      },
    });
    await expect(
      failedHost.callTool('kanban_read', { action: 'get_board', boardId: 'missing' }),
    ).resolves.toEqual({
      isError: true,
      content: {
        ok: false,
        error: {
          code: 'REFUSED',
          message: '[REFUSED] Cannot start. Issues: assignee: Assign an owner.',
          retryable: false,
          issues,
        },
      },
    });

    const thrownHost = createKanbanMcpToolHost('C:/project', {
      dependencies: { executeKanban: vi.fn().mockRejectedValue(new Error('daemon failed')) },
    });
    await expect(thrownHost.callTool('kanban_read', { action: 'list_boards' })).resolves.toEqual({
      content: 'daemon failed',
      isError: true,
    });
  });

  it('long-polls and filters daemon mutation events by board', async () => {
    let listener: ((event: KanbanServerEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: {
        executeKanban: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          subscribe: (next: (event: KanbanServerEvent) => void) => {
            listener = next;
            return unsubscribe;
          },
          onDisconnect: () => vi.fn(),
        }),
      },
    });

    const pending = host.callTool('kanban_watch', { boardId: 'board-a', timeoutMs: 1_000 });
    await vi.waitFor(() => expect(listener).toBeTypeOf('function'));
    listener?.({ type: 'event', event: 'board.updated', data: { boardId: 'board-b' } });
    listener?.({ type: 'event', event: 'board.updated', data: { boardId: 'board-a' } });

    await expect(pending).resolves.toEqual({
      content: {
        changed: true,
        event: 'board.updated',
        data: { boardId: 'board-a' },
      },
      isError: false,
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reports disabled live watch without falling back to files', async () => {
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: {
        executeKanban: vi.fn(),
        getConnection: vi.fn().mockResolvedValue(null),
      },
    });
    await expect(host.callTool('kanban_watch', {})).resolves.toEqual({
      content: 'Kanban project server is disabled; live watch is unavailable',
      isError: true,
    });
  });

  it('cancels a live watch and releases daemon listeners immediately', async () => {
    const unsubscribeEvent = vi.fn();
    const unsubscribeDisconnect = vi.fn();
    const controller = new AbortController();
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: {
        executeKanban: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({
          subscribe: () => unsubscribeEvent,
          onDisconnect: () => unsubscribeDisconnect,
        }),
      },
    });

    const pending = host.callTool(
      'kanban_watch',
      { timeoutMs: 25_000 },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(unsubscribeEvent).not.toHaveBeenCalled());
    controller.abort(new Error('client stopped watching'));

    await expect(pending).resolves.toEqual({
      content: 'client stopped watching',
      isError: true,
    });
    expect(unsubscribeEvent).toHaveBeenCalledOnce();
    expect(unsubscribeDisconnect).toHaveBeenCalledOnce();
  });

  it('does not acquire a daemon connection for a pre-cancelled watch', async () => {
    const getConnection = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    const host = createKanbanMcpToolHost('C:/project', {
      dependencies: { executeKanban: vi.fn(), getConnection },
    });

    await expect(host.callTool('kanban_watch', {}, { signal: controller.signal })).resolves.toEqual(
      { content: 'already cancelled', isError: true },
    );
    expect(getConnection).not.toHaveBeenCalled();
  });
});

describe('Kanban MCP against the real kanban tool', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wstack-kanban-mcp-adapter-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('keeps the read tier identical to the tool read-only actions', () => {
    const readOnly = (kanbanToolModule as Record<string, unknown>)['KANBAN_READ_ONLY_ACTIONS'];
    expect(Array.isArray(readOnly)).toBe(true);
    expect([...KANBAN_READ_ACTIONS].sort()).toEqual([...(readOnly as string[])].sort());
  });

  // The MCP context has no setCurrentKanbanTask (it is not an agent run). The
  // managed start_task path called it unguarded, so the card was moved to
  // Running with a lease and THEN the call died with a TypeError.
  it('starts a managed card through the MCP context without a TypeError', async () => {
    const board = await createBoard(dir, {
      title: 'Managed via MCP',
      columns: [
        { id: 'backlog', title: 'Backlog', order: 0 },
        { id: 'todo', title: 'Todo', order: 1 },
        { id: 'in-progress', title: 'Running', order: 2 },
        { id: 'review', title: 'Review', order: 3 },
        { id: 'done', title: 'Done', order: 4 },
      ],
      lifecycle: {
        mode: 'managed',
        columns: {
          backlog: 'backlog',
          todo: 'todo',
          running: 'in-progress',
          review: 'review',
          done: 'done',
        },
      },
    });
    const added = await addTask(dir, board.id, {
      title: 'Implement safely',
      description: 'Change the parser while preserving existing behavior.',
      assignedAgent: 'agent-1',
      dueDate: '2026-08-10T00:00:00.000Z',
      labels: ['parser'],
    });
    const taskId = added!.task.id;
    await addGoalMetricToTask(dir, board.id, taskId, { name: 'New syntax parses', target: 'pass' });
    await addCheckToTask(dir, board.id, taskId, {
      description: 'Regression suite passes',
      type: 'test',
    });

    const host = createKanbanMcpToolHost(dir, { actor: 'agent-1', writable: true });
    const result = await host.callTool('kanban_manage', {
      action: 'start_task',
      boardId: board.id,
      taskId,
      author: 'agent-1',
      transitionComment: 'Starting from an external MCP client.',
    });

    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const content = result.content as { ok: boolean; task: KanbanTask };
    expect(content.task.lifecycle?.currentStage).toBe('running');
    expect(content.task.assignment?.status).toBe('running');
  });

  it('returns a structured NOT_FOUND for a missing board', async () => {
    const host = createKanbanMcpToolHost(dir, { actor: 'agent-1' });
    const result = await host.callTool('kanban_read', { action: 'get_board', boardId: 'nope' });
    expect(result).toMatchObject({
      isError: true,
      content: { ok: false, error: { code: 'NOT_FOUND', retryable: false } },
    });
  });
});

describe('createKanbanMcpServer', () => {
  it('publishes server identity and the Kanban workflow prompt', async () => {
    const server = createKanbanMcpServer('C:/project', {
      dependencies: { executeKanban: vi.fn() },
    });
    const initialized = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      ))!,
    ) as { result: { serverInfo: { name: string } } };
    expect(initialized.result.serverInfo.name).toBe('wrongstack-kanban-mcp');

    const prompts = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/list', params: {} }),
      ))!,
    ) as { result: { prompts: Array<{ name: string }> } };
    expect(prompts.result.prompts).toContainEqual(
      expect.objectContaining({ name: 'work-kanban-task' }),
    );

    const rendered = JSON.parse(
      (await server.handleMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'prompts/get',
          params: { name: 'work-kanban-task', arguments: { boardId: 'board-1' } },
        }),
      ))!,
    ) as { result: { messages: Array<{ content: { text: string } }> } };
    expect(rendered.result.messages[0]?.content.text).toContain('board-1');
  });
});
