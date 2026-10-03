import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateDefinitionOfDone } from '../src/manager/lifecycle.js';
import { getDependencyReadinessIssues } from '../src/manager/task-readiness.js';
import type { TaskGraph, TaskNode } from '../src/types/task-graph.js';
import type { KanbanBoard, KanbanCheck, KanbanTask } from '../src/types.js';
import { GitDiffPlugin } from '../src/verification/plugins/git-diff.js';
import { VerificationContext } from '../src/verification/verification-context.js';
import { VerifierRegistry } from '../src/verification/verifier-registry.js';
import {
  addTask,
  areDependenciesMet,
  assignTask,
  createBoard,
  createBoardFromTaskGraph,
  exportBoardToTaskGraph,
  getBoard,
  listBoards,
  mergeTasks,
  splitTask,
  syncBoardFromTaskGraph,
  updateTask,
  updateTaskAssignment,
  verifyTaskCompletion,
} from './helpers/session-manager.js';

const roots: string[] = [];
const at = '2026-10-02T00:00:00Z';
const accepted: KanbanCheck[] = [
  {
    id: 'accepted',
    type: 'manual',
    description: 'Reviewer accepted the original work',
    status: 'passed',
    checkedBy: 'reviewer',
    checkedAt: at,
  },
];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kanban-relations-'));
  roots.push(root);
  const board = await createBoard(root, { title: 'Relationship integrity' });
  const first = await addTask(root, board.id, { title: 'First', successCriteria: accepted });
  const second = await addTask(root, board.id, { title: 'Second', successCriteria: accepted });
  if (!first || !second) throw new Error('Missing fixture task');
  return { root, boardId: board.id, first: first.task, second: second.task };
}

describe('Kanban relationship integrity', () => {
  it('records verification start before executing checks instead of at report construction', async () => {
    const { root, boardId, first } = await fixture();
    vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue({
      id: 'baseline',
      capturedAt: at,
      commitHash: '',
      treeHash: '',
    });
    let checkStarted = 0;
    const registry = new VerifierRegistry().register({
      id: 'timed',
      kind: 'deterministic',
      canHandle: () => true,
      verify: async (check) => {
        checkStarted = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          checkId: check.id,
          description: check.description,
          type: check.type,
          status: 'passed',
          evidence: {},
        };
      },
    });
    const result = await verifyTaskCompletion(root, boardId, first.id, { registry });
    expect(Date.parse(result.report.startedAt)).toBeLessThanOrEqual(checkStarted);
    expect(
      Date.parse(result.report.completedAt) - Date.parse(result.report.startedAt),
    ).toBeGreaterThanOrEqual(30);
  });
  it.each(['create', 'sync'] as const)(
    'rejects a cyclic parent/child graph before %s publishes hidden unworkable cards',
    async (method) => {
      const { root, boardId } = await fixture();
      const node = (id: string, child: string): TaskNode => ({
        id,
        title: id,
        description: 'Graph work',
        type: 'feature',
        priority: 'medium',
        status: 'pending',
        children: [child],
        parentId: child,
        createdAt: 1,
        updatedAt: 1,
      });
      const graph: TaskGraph = {
        id: 'cyclic-import',
        specId: 'spec',
        title: 'Cyclic graph',
        nodes: new Map([
          ['a', node('a', 'b')],
          ['b', node('b', 'a')],
        ]),
        edges: [],
        rootNodes: [],
        createdAt: 1,
        updatedAt: 1,
      };
      const before = await getBoard(root, boardId);
      const summaries = await listBoards(root);
      const work =
        method === 'create'
          ? createBoardFromTaskGraph(root, graph)
          : syncBoardFromTaskGraph(root, boardId, graph);
      await expect(work).rejects.toThrow(/parent.*cycle|cyclic.*parent|child.*cycle/i);
      expect(await getBoard(root, boardId)).toEqual(before);
      expect((await listBoards(root)).map((board) => board.id)).toEqual(
        summaries.map((board) => board.id),
      );
    },
  );
  it('does not advertise a missing task as having satisfied dependencies', () => {
    const board = { tasks: [] } as unknown as KanbanBoard;
    expect(areDependenciesMet(board, 'missing')).toBe(false);
  });
  it('uses exact stored dependency IDs instead of resolving a missing ID as a prefix', () => {
    const board = {
      tasks: [
        { id: 'downstream', dependsOn: ['removed'] },
        { id: 'removed-successor', status: 'completed' },
      ],
    } as unknown as KanbanBoard;
    expect(getDependencyReadinessIssues(board, 'downstream')).toEqual([
      { dependencyId: 'removed', status: 'missing' },
    ]);
    expect(areDependenciesMet(board, 'downstream')).toBe(false);
  });
  it('preserves prefix convenience for the caller task without using it for stored dependencies', () => {
    const board = {
      tasks: [
        { id: 'caller-full-id', dependsOn: ['dependency-full-id'] },
        { id: 'dependency-full-id', status: 'completed' },
      ],
    } as unknown as KanbanBoard;
    expect(areDependenciesMet(board, 'caller')).toBe(true);
  });
  it('does not carry reviewer acceptance into new split children', async () => {
    const { root, boardId, first } = await fixture();
    const result = await splitTask(root, boardId, first.id, {
      titles: ['New child'],
      inheritSuccessCriteria: true,
    });
    expect(result?.children[0]?.successCriteria?.[0]).toMatchObject({ status: 'pending' });
    expect(result?.children[0]?.successCriteria?.[0]?.checkedAt).toBeUndefined();
    expect(
      (await getBoard(root, boardId))?.tasks.find((task) => task.id === first.id)
        ?.successCriteria?.[0]?.status,
    ).toBe('passed');
  });
  it('does not carry reviewer acceptance into new merged work', async () => {
    const { root, boardId, first, second } = await fixture();
    const result = await mergeTasks(root, boardId, {
      taskIds: [first.id, second.id],
      title: 'New merged work',
    });
    expect(result?.task.successCriteria?.every((check) => check.status === 'pending')).toBe(true);
    expect(result?.task.successCriteria?.every((check) => check.checkedBy === undefined)).toBe(
      true,
    );
  });
  it.each(['split', 'merge'] as const)(
    'copies assignment routing on %s without duplicating an active claim',
    async (method) => {
      const { root, boardId, first, second } = await fixture();
      await assignTask(root, boardId, first.id, {
        agentId: 'worker',
        status: 'running',
        leaseId: 'source-live-lease',
        attempt: 3,
        maxAttempts: 5,
        modelRouting: 'fixed',
        provider: 'provider',
        model: 'model',
      });
      await updateTaskAssignment(root, boardId, first.id, {
        subagentId: 'source-worker',
        runTaskId: 'source-run',
        lastResult: 'Old work',
      });
      const created =
        method === 'split'
          ? (
              await splitTask(root, boardId, first.id, {
                titles: ['Fresh'],
                inheritAssignment: true,
              })
            )?.children[0]
          : (
              await mergeTasks(root, boardId, {
                taskIds: [first.id, second.id],
                title: 'Fresh',
                preserveAssignment: true,
              })
            )?.task;
      expect(created?.assignment).toMatchObject({
        status: 'assigned',
        agentId: 'worker',
        provider: 'provider',
        model: 'model',
        maxAttempts: 5,
      });
      expect(created?.status).toBe('pending');
      for (const key of [
        'leaseId',
        'attempt',
        'claimedAt',
        'heartbeatAt',
        'leaseExpiresAt',
        'dispatchedAt',
        'completedAt',
        'subagentId',
        'runTaskId',
        'lastResult',
        'verificationBaseline',
      ]) {
        expect(
          created?.assignment?.[key as keyof NonNullable<KanbanTask['assignment']>],
          key,
        ).toBeUndefined();
      }
    },
  );
  it.each(['completed', 'review', 'blocked'] as const)(
    'exports accepted card state %s even when worker telemetry is stale',
    async (status) => {
      const { root, boardId, first } = await fixture();
      await updateTask(root, boardId, first.id, {
        status,
        assignment: { status: 'running', agentId: 'old-worker' },
      });
      const exported = await exportBoardToTaskGraph(root, boardId);
      const nodeId = exported!.taskIdMap.get(first.id)!;
      expect(exported!.graph.nodes.get(nodeId)?.status).toBe(status);
    },
  );
  it('does not admit executable criteria solely from a manually set passed flag', () => {
    const task = {
      id: 't1',
      title: 'Not executed',
      successCriteria: [{ id: 'c1', type: 'command', description: 'Run tests', status: 'passed' }],
    } as KanbanTask;
    expect(validateDefinitionOfDone(task).length).toBeGreaterThan(0);
    expect(validateDefinitionOfDone({ ...task, successCriteria: accepted })).toEqual([]);
  });
  it('does not admit a declared file contract without a file-scope report', () => {
    const task = {
      id: 't1',
      title: 'Not scoped',
      successCriteria: accepted,
      expectedFileChanges: [{ path: 'work.ts', operation: 'modify' }],
    } as KanbanTask;
    expect(
      validateDefinitionOfDone(task).some((issue) => issue.field === 'verificationReport'),
    ).toBe(true);
  });
  it('invalidates parent evidence when a completed child is redefined', async () => {
    const { root, boardId, first: parent, second: child } = await fixture();
    await updateTask(root, boardId, parent.id, { atomic: true, childTaskIds: [child.id] });
    await updateTask(root, boardId, child.id, {
      status: 'completed',
      description: 'Original child definition',
    });
    vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue({
      id: 'baseline',
      capturedAt: at,
      commitHash: '',
      treeHash: '',
    });
    const registry = new VerifierRegistry().register({
      id: 'controlled',
      kind: 'deterministic',
      canHandle: () => true,
      verify: async (check) => ({
        checkId: check.id,
        description: check.description,
        type: check.type,
        status: 'passed',
        evidence: {},
      }),
    });
    const verified = await verifyTaskCompletion(root, boardId, parent.id, { registry });
    await updateTask(root, boardId, child.id, {
      description: 'Different unverified child definition',
    });
    const board = (await getBoard(root, boardId))!;
    expect(
      validateDefinitionOfDone(
        board.tasks.find((task) => task.id === parent.id)!,
        verified.report,
        { board },
      ).length,
    ).toBeGreaterThan(0);
    const fresh = await verifyTaskCompletion(root, boardId, parent.id, { registry });
    expect(validateDefinitionOfDone(fresh.task, fresh.report, { board: fresh.board })).toEqual([]);
  });
  it('does not accept an unchanged task baseline merely because the worktree was already dirty', async () => {
    const context = {
      diffSince: async () => [],
      gitStatus: async () => ({
        clean: false,
        files: ['pre-existing.ts'],
        unstaged: 1,
        staged: 0,
        untracked: 0,
      }),
    } as unknown as VerificationContext;
    const result = await new GitDiffPlugin().verify(
      { id: 'c1', description: 'Task changed code', type: 'git_diff', status: 'pending' },
      context,
    );
    expect(result.status).toBe('failed');
  });

  it('binds nested descendants while allowing unrelated board metadata updates', async () => {
    const { root, boardId, first: parent, second: child } = await fixture();
    const grandchild = await addTask(root, boardId, {
      title: 'Grandchild',
      status: 'completed',
      successCriteria: accepted,
    });
    const unrelated = await addTask(root, boardId, { title: 'Unrelated work' });
    await updateTask(root, boardId, child.id, {
      atomic: true,
      status: 'completed',
      childTaskIds: [grandchild!.task.id],
    });
    await updateTask(root, boardId, parent.id, { atomic: true, childTaskIds: [child.id] });
    vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue({
      id: 'baseline',
      capturedAt: at,
      commitHash: '',
      treeHash: '',
    });
    const verified = await verifyTaskCompletion(root, boardId, parent.id);
    await updateTask(root, boardId, unrelated!.task.id, { priority: 'high' });
    let board = (await getBoard(root, boardId))!;
    const current = () => board.tasks.find((task) => task.id === parent.id)!;
    expect(validateDefinitionOfDone(current(), verified.report, { board })).toEqual([]);
    await updateTask(root, boardId, grandchild!.task.id, {
      description: 'Changed deepest contract',
    });
    board = (await getBoard(root, boardId))!;
    expect(
      validateDefinitionOfDone(current(), verified.report, { board }).some(
        (issue) => issue.field === 'verificationReport',
      ),
    ).toBe(true);
  });

  it('rejects an unreadable baseline rather than reporting an empty diff', async () => {
    const { root, boardId, first } = await fixture();
    const board = (await getBoard(root, boardId))!;
    const context = new VerificationContext({
      projectRoot: root,
      board,
      task: first,
      snapshot: { id: 'unreadable', capturedAt: at, commitHash: '', treeHash: 'a'.repeat(40) },
    });
    await expect(context.diffSince()).rejects.toThrow(/diff|git|repository/i);
  });

  it('records a diff read failure as a verification error with an actionable reason', async () => {
    const context = {
      diffSince: async () => {
        throw new Error('Baseline object is missing');
      },
      gitStatus: async () => ({ clean: false, files: ['work.ts'] }),
    } as unknown as VerificationContext;
    const result = await new GitDiffPlugin().verify(
      { id: 'c1', description: 'Task changes', type: 'git_diff', status: 'pending' },
      context,
    );
    expect(result.status).toBe('error');
    expect(result.error).toContain('Baseline object is missing');
  });

  it('does not resolve a missing stored child ID as an unrelated prefix match', async () => {
    const { root, boardId, first: parent, second: child } = await fixture();
    await updateTask(root, boardId, parent.id, {
      atomic: true,
      childTaskIds: [child.id.slice(0, 8)],
    });
    vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue({
      id: 'baseline',
      capturedAt: at,
      commitHash: '',
      treeHash: '',
    });
    const result = await verifyTaskCompletion(root, boardId, parent.id, { persist: false });
    expect(result.report.subtasks?.children[0]?.verdict).toBe('failed');
    expect(result.report.verdict).toBe('failed');
  });
});
