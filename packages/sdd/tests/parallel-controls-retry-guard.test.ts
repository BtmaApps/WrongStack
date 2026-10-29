import { describe, expect, it } from 'vitest';
import { splitGraphNode } from '../src/graph-split.js';
import {
  deleteTask,
  retryTask,
  type SddParallelControlsHost,
} from '../src/sdd-parallel-controls.js';

describe('retryTask status and active subagent guard', () => {
  it('allows retrying failed or blocked tasks while refusing in_progress, completed, or active-subagent tasks', () => {
    const nodes = new Map<string, { status: string; metadata: Record<string, unknown> }>([
      ['failed-1', { status: 'failed', metadata: { cancelled: true } }],
      ['blocked-1', { status: 'blocked', metadata: {} }],
      ['running-1', { status: 'in_progress', metadata: {} }],
      ['done-1', { status: 'completed', metadata: {} }],
      ['pending-active', { status: 'pending', metadata: {} }],
    ]);

    const retryMap = new Map<string, number>([
      ['failed-1', 2],
      ['running-1', 1],
    ]);
    const cancelledTasks = new Set<string>(['failed-1']);
    const taskSubagents = new Map<string, string>([['pending-active', 'sub-1']]);

    const host = {
      opts: {
        tracker: {
          getNode: (id: string) => nodes.get(id) as never,
          patchMetadata: (id: string, patch: Record<string, unknown>) => {
            const n = nodes.get(id);
            if (n) Object.assign(n.metadata, patch);
          },
          updateNodeStatus: (id: string, status: string) => {
            const n = nodes.get(id);
            if (n) n.status = status;
          },
          updateNode: () => {},
        } as never,
        worktrees: undefined,
      } as never,
      retryMap,
      cancelledTasks,
      taskSubagents,
      mergedCommits: [],
      baseBranch: undefined,
      isRunning: () => true,
      persistRetries: () => {},
    } as unknown as SddParallelControlsHost;

    expect(retryTask(host, 'failed-1')).toBe(true);
    expect(nodes.get('failed-1')?.status).toBe('pending');
    expect(cancelledTasks.has('failed-1')).toBe(false);

    expect(retryTask(host, 'blocked-1')).toBe(true);
    expect(nodes.get('blocked-1')?.status).toBe('pending');

    expect(retryTask(host, 'running-1')).toBe(false);
    expect(nodes.get('running-1')?.status).toBe('in_progress');
    expect(retryMap.get('running-1')).toBe(1);

    expect(retryTask(host, 'done-1')).toBe(false);
    expect(nodes.get('done-1')?.status).toBe('completed');

    expect(retryTask(host, 'pending-active')).toBe(false);
    expect(retryTask(host, 'missing')).toBe(false);
  });

  it('refuses deleteTask and splitGraphNode on terminal completed tasks', () => {
    const nodes = new Map<string, { status: string; metadata: Record<string, unknown> }>([
      ['done-1', { status: 'completed', metadata: {} }],
      ['failed-1', { status: 'failed', metadata: {} }],
    ]);
    const tracker = {
      getNode: (id: string) => nodes.get(id) as never,
      removeNode: (id: string) => nodes.delete(id),
    };
    const host = {
      opts: { tracker } as never,
      retryMap: new Map<string, number>(),
      cancelledTasks: new Set<string>(),
      taskSubagents: new Map<string, string>(),
    } as unknown as SddParallelControlsHost;

    expect(deleteTask(host, 'done-1')).toBe(false);
    expect(nodes.has('done-1')).toBe(true);
    expect(
      splitGraphNode(tracker as never, 'done-1', [{ title: 'Sub', description: 'd' }]),
    ).toEqual([]);

    expect(deleteTask(host, 'failed-1')).toBe(true);
    expect(nodes.has('failed-1')).toBe(false);
  });

  it('releases worktree when executeSddTask fails during spawn or integrateTaskWorktree throws (F673)', async () => {
    const { TaskTracker } = await import('@wrongstack/core/tasking');
    const { executeSddTask } = await import('../src/sdd-task-execution.js');
    const { allocateTaskWorktrees, integrateTaskWorktree, resolveTaskWorktrees } = await import(
      '../src/sdd-worktree-integration.js'
    );

    const released: string[] = [];
    const emitted: string[] = [];
    const tracker = new TaskTracker({
      store: { saveGraph: async () => {}, loadGraph: async () => null } as never,
    });
    const graph = await tracker.createGraph('spec-f673', 'Graph F673');
    const task = tracker.addNode({
      title: 'Task F673',
      description: 'Desc',
      type: 'feature',
      priority: 'medium',
      status: 'pending',
    });
    const state = {
      taskCwds: new Map<string, string>(),
      taskBranches: new Map<string, string>(),
      taskWorktrees: new Map(),
      mergedCommits: [] as Array<{ taskId: string; sha: string; title: string }>,
    };
    const wt = {
      allocate: async (id: string) => ({
        id,
        dir: `/tmp/${id}`,
        branch: `sdd/${id}`,
        baseBranch: 'main',
        status: 'active' as const,
        createdAt: Date.now(),
      }),
      commitAll: async () => {
        throw new Error('git index.lock contention');
      },
      release: async (h: { id: string }) => {
        released.push(h.id);
      },
    };
    const opts = { tracker, graph, projectRoot: '/tmp', worktrees: wt as never } as never;

    await expect(
      executeSddTask({
        task,
        opts,
        coordinator: { spawn: async () => ({ subagentId: '' }) } as never,
        usedNicknames: new Set(),
        idleTimeoutMs: 1000,
        timeoutMs: undefined,
        runId: 'run-f673',
        nextSubagentId: () => 'sub-1',
        emit: () => {},
        taskCwds: state.taskCwds,
        taskBranches: state.taskBranches,
        taskSubagents: new Map(),
        cancelledTasks: new Set(),
        allocateWorktrees: (tasks) => allocateTaskWorktrees(opts, state, tasks),
        resolveWorktrees: (tasks) => resolveTaskWorktrees(opts, state, tasks),
        integrateWorktree: () => Promise.resolve({ ok: true }),
        applyTaskFailure: async () => {},
      }),
    ).rejects.toThrow();
    expect(released).toContain(`sdd-${task.id}`);
    expect(state.taskWorktrees.has(task.id)).toBe(false);

    released.length = 0;
    await executeSddTask({
      task,
      opts,
      coordinator: {
        spawn: async () => ({ subagentId: 'sub-2' }),
        assign: async () => {},
        awaitTasks: async () => [
          {
            subagentId: 'sub-2',
            taskId: 'corr-2',
            status: 'success',
            iterations: 1,
            toolCalls: 1,
            durationMs: 10,
          },
        ],
      } as never,
      usedNicknames: new Set(),
      idleTimeoutMs: 1000,
      timeoutMs: undefined,
      runId: 'run-f673',
      nextSubagentId: () => 'sub-2',
      emit: (ev) => {
        emitted.push(ev);
      },
      taskCwds: state.taskCwds,
      taskBranches: state.taskBranches,
      taskSubagents: new Map(),
      cancelledTasks: new Set(),
      allocateWorktrees: (tasks) => allocateTaskWorktrees(opts, state, tasks),
      resolveWorktrees: (tasks) => resolveTaskWorktrees(opts, state, tasks),
      integrateWorktree: (taskNode, result) =>
        integrateTaskWorktree({
          opts,
          state,
          task: taskNode,
          result,
          runId: 'run-f673',
          emit: () => {},
          abortRun: () => {},
        }),
      applyTaskFailure: async () => {},
    });
    expect(released).toContain(`sdd-${task.id}`);
    expect(state.taskWorktrees.has(task.id)).toBe(false);
  });
});
