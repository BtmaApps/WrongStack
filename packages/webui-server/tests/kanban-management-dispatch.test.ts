import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createKanbanTaskDispatcher,
  createManagementDispatcher,
} from '../src/server/kanban-management-dispatch.js';
import type { WebuiDeps, WebuiMutableState } from '../src/server/routes.js';

const mocks = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock('@wrongstack/runtime', () => ({ makeLightSubagentFactory: () => mocks.factory }));
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => vi.clearAllMocks());
describe('standalone management dispatch', () => {
  it('preserves explicit worker capabilities and the initiating session in the isolated factory', async () => {
    const worker = {
      ctx: { meta: {} },
      run: vi.fn(async () => ({ status: 'done', finalText: 'Done' })),
    };
    mocks.factory.mockResolvedValue({ agent: worker, dispose: vi.fn() });
    await createManagementDispatcher(deps, state)('Inspect only', {
      context: { sessionId: 'owner', kanban: { projectRoot: '/project' } },
      allowedCapabilities: ['fs.read'],
    } as Parameters<ReturnType<typeof createManagementDispatcher>>[1]);
    await flush();
    expect(mocks.factory).toHaveBeenCalledWith(
      expect.objectContaining({ allowedCapabilities: ['fs.read'], originSessionId: 'owner' }),
    );
  });
  const state = {
    getProjectRoot: () => '/project',
    getConfig: () => ({ provider: 'account-alias' }),
  } as WebuiMutableState;
  const deps = {
    agent: { ctx: { session: { id: 'leader' }, model: 'leader-model' } },
    logger: { warn: vi.fn() },
  } as unknown as WebuiDeps;

  it('uses isolated context, restricted tools, account alias, and cancellation', async () => {
    const worker = {
      ctx: { meta: {} as Record<string, unknown> },
      run: vi.fn(async () => ({ status: 'done', finalText: 'Reviewed cards' })),
    };
    const dispose = vi.fn();
    mocks.factory.mockResolvedValue({ agent: worker, dispose });
    const controller = new AbortController();
    const context = {
      sessionId: 'leader',
      kanban: { boardId: 'b', projectRoot: '/project', managementToken: 'token' },
    };
    const onDone = vi.fn();
    await createManagementDispatcher(deps, state)('Manage cards', {
      context,
      signal: controller.signal,
      onDone,
    });
    await flush();
    expect(worker.ctx.meta.kanban).toEqual(context.kanban);
    expect(mocks.factory).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'account-alias',
        model: 'leader-model',
        tools: ['kanban', 'read', 'grep', 'glob', 'tree'],
      }),
    );
    expect(worker.run).toHaveBeenCalledWith('Manage cards', { signal: controller.signal });
    expect(onDone).toHaveBeenCalledWith({ status: 'completed', result: 'Reviewed cards' });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports construction failure so a durable management lease can be released', async () => {
    mocks.factory.mockRejectedValue(new Error('provider unavailable'));
    const onDone = vi.fn();
    await createManagementDispatcher(deps, state)('Manage cards', {
      context: { kanban: { boardId: 'b', projectRoot: '/project' } },
      onDone,
    });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ status: 'failed', error: 'provider unavailable' });
  });
  it('dispatches an explicit card with its full tool set, role, owner and lease identity', async () => {
    const worker = {
      ctx: { meta: {} as Record<string, unknown> },
      run: vi.fn(async () => ({ status: 'done', finalText: 'Card completed' })),
    };
    const dispose = vi.fn();
    mocks.factory.mockResolvedValue({ agent: worker, dispose });
    const taskDeps = {
      ...deps,
      context: { session: { id: 'project-owner' } },
      agent: {
        ctx: {
          session: { id: 'project-owner' },
          model: 'leader-model',
          tools: [],
        },
      },
      toolRegistry: { listForProvider: () => [{ name: 'read' }, { name: 'write' }] },
    } as unknown as WebuiDeps;
    const onDone = vi.fn();
    const summary = await createKanbanTaskDispatcher(taskDeps, state)('Complete the card', {
      role: 'reviewer',
      tools: [],
      allowedCapabilities: ['fs.read'],
      context: {
        sessionId: 'request-owner',
        kanban: { boardId: 'b', taskId: 't', projectRoot: '/project', leaseId: 'lease' },
      },
      onDone,
    });
    await flush();
    expect(summary).toMatch(/^Spawned subagent kanban-manager-/);
    expect(mocks.factory).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: ['read', 'write'],
        role: 'reviewer',
        allowedCapabilities: ['fs.read'],
        originSessionId: 'request-owner',
      }),
    );
    expect(worker.ctx.meta.kanban).toEqual({
      boardId: 'b',
      taskId: 't',
      projectRoot: '/project',
      leaseId: 'lease',
    });
    expect(onDone).toHaveBeenCalledWith({ status: 'completed', result: 'Card completed' });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
