import { describe, expect, it } from 'vitest';
import { retryTask, type SddParallelControlsHost } from '../src/sdd-parallel-controls.js';

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
});
