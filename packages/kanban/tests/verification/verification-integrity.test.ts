import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateDefinitionOfDone,
  validateManagedTaskTransition,
} from '../../src/manager/lifecycle.js';
import { mutateBoard } from '../../src/storage.js';
import type {
  KanbanBoard,
  KanbanCheck,
  KanbanTask,
  KanbanVerificationCheckResult,
} from '../../src/types.js';
import { VerificationContext } from '../../src/verification/verification-context.js';
import { buildVerificationReport } from '../../src/verification/verification-report.js';
import { VerifierRegistry } from '../../src/verification/verifier-registry.js';
import {
  addCheckToTask,
  addTask,
  assignTask,
  copyTaskToBoard,
  createBoard,
  finalizeTaskCompletion,
  getBoard,
  reconcileKanbanBoard,
  removeTask,
  updateCheckOnTask,
  updateTask,
  updateTaskAssignment,
  verifyTaskCompletion,
} from '../helpers/session-manager.js';

const roots: string[] = [];
const baseline = {
  id: 'assignment-baseline',
  capturedAt: '2026-10-02T00:00:00Z',
  commitHash: '',
  treeHash: 'a'.repeat(40),
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kanban-integrity-'));
  roots.push(root);
  vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue(baseline);
  const board = await createBoard(root, {
    title: 'Integrity',
    completionGate: { enforcement: 'strict' },
  });
  const added = await addTask(root, board.id, {
    title: 'Task',
    description: 'Implement the contract',
    successCriteria: [
      {
        id: 'c1',
        description: 'Acceptance',
        type: 'command',
        status: 'pending',
        notes: 'old-command',
      },
    ],
  });
  if (!added) throw new Error('Missing task');
  return { root, boardId: board.id, taskId: added.task.id };
}

function passingRegistry(hook: (context: VerificationContext) => Promise<void> = async () => {}) {
  return new VerifierRegistry().register({
    id: 'controlled',
    kind: 'deterministic',
    canHandle: () => true,
    async verify(
      check: KanbanCheck,
      context: VerificationContext,
    ): Promise<KanbanVerificationCheckResult> {
      await hook(context);
      return {
        checkId: check.id,
        description: check.description,
        type: check.type,
        status: 'passed',
        evidence: { controlled: true },
      };
    },
  });
}

describe('verification integrity', () => {
  it.each([
    { type: 'agent' as const },
    { type: 'manual' as const, escalation: 'council' as const },
    { type: 'auto' as const },
  ])('cannot manufacture a pass when the required verifier is unavailable: %j', async (input) => {
    const result = await new VerifierRegistry().verify(
      { id: 'c1', description: 'Needs a verifier', status: 'passed', ...input },
      {} as VerificationContext,
    );
    expect(result.status).toBe('skipped');
  });
  it('does not let deterministic reconciliation revive archived work', async () => {
    const { root, boardId } = await fixture();
    await mutateBoard(root, boardId, (board) => {
      const task = board.tasks[0]!;
      task.status = 'archived';
      task.assignment = { agentId: 'old-worker', status: 'running' };
    });
    await reconcileKanbanBoard(root, boardId);
    expect((await getBoard(root, boardId))?.tasks[0]?.status).toBe('archived');
  });

  it("cannot reconcile a strict card to Done using another attempt's report", async () => {
    const { root, boardId, taskId } = await fixture();
    await mutateBoard(root, boardId, (board) => {
      board.tasks[0]!.assignment = {
        agentId: 'worker',
        status: 'running',
        leaseId: 'old',
        attempt: 1,
      };
    });
    await verifyTaskCompletion(root, boardId, taskId, { registry: passingRegistry() });
    await mutateBoard(root, boardId, (board) => {
      const task = board.tasks[0]!;
      task.status = 'review';
      task.assignment = { agentId: 'successor', status: 'completed', leaseId: 'new', attempt: 2 };
    });
    await reconcileKanbanBoard(root, boardId);
    expect((await getBoard(root, boardId))?.tasks[0]?.status).toBe('review');
  });

  it('does not label skipped acceptance checks as verified passed', () => {
    const report = buildVerificationReport({
      taskId: 't1',
      taskTitle: 'Pending check',
      boardId: 'b1',
      checks: [
        {
          checkId: 'c1',
          description: 'Not evaluated',
          type: 'manual',
          status: 'skipped',
          evidence: {},
        },
      ],
    });
    expect(report.verdict).toBe('needs_human');
  });
  it.each(['assign', 'update'] as const)(
    'captures the pre-work file baseline on %s running assignment',
    async (method) => {
      const { root, boardId, taskId } = await fixture();
      await updateTask(root, boardId, taskId, {
        expectedFileChanges: [{ path: 'work.ts', operation: 'modify' }],
      });
      const start = { status: 'running' as const, agentId: 'worker', leaseId: 'lease-before-work' };
      if (method === 'assign') await assignTask(root, boardId, taskId, start);
      else await updateTaskAssignment(root, boardId, taskId, start);
      const assignment = (await getBoard(root, boardId))?.tasks[0]?.assignment;
      expect(assignment).toMatchObject({ verificationBaseline: baseline });
      vi.spyOn(VerificationContext.prototype, 'diffSince').mockImplementation(async function (
        this: VerificationContext,
      ) {
        expect(this.capturedSnapshot?.id).toBe(baseline.id);
        return [{ path: 'work.ts', operation: 'modify', linesAdded: 1, linesRemoved: 0 }];
      });
      expect(
        (await verifyTaskCompletion(root, boardId, taskId, { registry: passingRegistry() })).report
          .verdict,
      ).toBe('passed');
    },
  );
  it('persists a result when the verified board did not change', async () => {
    const { root, boardId, taskId } = await fixture();
    const result = await verifyTaskCompletion(root, boardId, taskId, {
      registry: passingRegistry(),
    });
    expect(result.report.verdict).toBe('passed');
    expect((await getBoard(root, boardId))?.tasks[0]?.verificationReport).toEqual(result.report);
  });

  it('rejects stale verification without overwriting criteria added during the run', async () => {
    const { root, boardId, taskId } = await fixture();
    const registry = passingRegistry(async () => {
      await addCheckToTask(root, boardId, taskId, {
        description: 'New requirement',
        type: 'manual',
        status: 'pending',
      });
    });
    await expect(verifyTaskCompletion(root, boardId, taskId, { registry })).rejects.toThrow(
      /Stale write detected/,
    );
    const task = (await getBoard(root, boardId))?.tasks[0];
    expect(task?.successCriteria?.map((c) => c.description)).toEqual([
      'Acceptance',
      'New requirement',
    ]);
    expect(task?.verificationReport).toBeUndefined();
  });

  it('does not return a phantom persisted result after the task was deleted', async () => {
    const { root, boardId, taskId } = await fixture();
    const registry = passingRegistry(async () => {
      await removeTask(root, boardId, taskId);
    });
    await expect(verifyTaskCompletion(root, boardId, taskId, { registry })).rejects.toThrow(
      /Task not found|Stale write detected/,
    );
    expect((await getBoard(root, boardId))?.tasks).toEqual([]);
  });

  it('cannot complete an archived task using a result started before archive', async () => {
    const { root, boardId, taskId } = await fixture();
    const registry = passingRegistry(async () => {
      await updateTask(root, boardId, taskId, { status: 'archived' });
    });
    await expect(finalizeTaskCompletion(root, boardId, taskId, { registry })).rejects.toThrow(
      /Stale write detected/,
    );
    expect((await getBoard(root, boardId))?.tasks[0]?.status).toBe('archived');
  });

  it('fails a file contract when the path matches but the operation does not', async () => {
    const { root, boardId, taskId } = await fixture();
    await updateTask(root, boardId, taskId, {
      expectedFileChanges: [{ path: 'src/a.ts', operation: 'modify' }],
    });
    vi.spyOn(VerificationContext.prototype, 'diffSince').mockResolvedValue([
      { path: 'src/a.ts', operation: 'delete', linesAdded: 0, linesRemoved: 8 },
    ]);
    const result = await verifyTaskCompletion(root, boardId, taskId, {
      registry: passingRegistry(),
      snapshot: baseline,
      persist: false,
    });
    expect(result.report.fileScope?.scopeMatches).toBe(false);
    expect(result.report.verdict).toBe('failed');
    expect(result.report.fileScope?.files[0]?.operation).toBe('delete');
  });

  it('checks simple child file scope when verifying its composite parent', async () => {
    const { root, boardId, taskId } = await fixture();
    const child = await addTask(root, boardId, {
      title: 'Child',
      expectedFileChanges: [{ path: 'missing.ts', operation: 'create' }],
    });
    await updateTask(root, boardId, taskId, { atomic: true, childTaskIds: [child!.task.id] });
    vi.spyOn(VerificationContext.prototype, 'diffSince').mockResolvedValue([]);
    const result = await verifyTaskCompletion(root, boardId, taskId, {
      registry: passingRegistry(),
      snapshot: baseline,
      persist: false,
    });
    expect(result.report.subtasks?.children[0]?.verdict).toBe('failed');
    expect(result.report.verdict).toBe('failed');
  });

  it('passes the provided baseline into full child verification', async () => {
    const { root, boardId, taskId } = await fixture();
    const child = await addTask(root, boardId, {
      title: 'Child',
      expectedFileChanges: [{ path: 'child.ts', operation: 'modify' }],
    });
    await updateTask(root, boardId, taskId, { atomic: true, childTaskIds: [child!.task.id] });
    const observed: string[] = [];
    vi.spyOn(VerificationContext.prototype, 'diffSince').mockImplementation(async function (
      this: VerificationContext,
    ) {
      observed.push(this.capturedSnapshot?.id ?? 'missing');
      return [{ path: 'child.ts', operation: 'modify', linesAdded: 2, linesRemoved: 1 }];
    });
    const result = await verifyTaskCompletion(root, boardId, taskId, {
      registry: passingRegistry(),
      snapshot: baseline,
      persist: false,
    });
    expect(result.report.verdict).toBe('passed');
    expect(observed).toEqual([baseline.id]);
  });

  it('invalidates a passed check when its executable notes change', async () => {
    const { root, boardId, taskId } = await fixture();
    await verifyTaskCompletion(root, boardId, taskId, { registry: passingRegistry() });
    await updateCheckOnTask(root, boardId, taskId, 'c1', { notes: 'different-command' });
    const task = (await getBoard(root, boardId))!.tasks[0]!;
    expect(task.successCriteria?.[0]?.status).toBe('pending');
    expect(task.successCriteria?.[0]?.checkedAt).toBeUndefined();
    expect(task.verificationReport).toBeUndefined();
    expect(validateDefinitionOfDone(task).length).toBeGreaterThan(0);
  });

  it('invalidates verification when bulk task details redefine the check input', async () => {
    const { root, boardId, taskId } = await fixture();
    await verifyTaskCompletion(root, boardId, taskId, { registry: passingRegistry() });
    const task = (await getBoard(root, boardId))!.tasks[0]!;
    await updateTask(root, boardId, taskId, {
      successCriteria: task.successCriteria!.map((check) => ({ ...check, notes: 'new-command' })),
    });
    const edited = (await getBoard(root, boardId))!.tasks[0]!;
    expect(edited.successCriteria?.[0]?.status).toBe('pending');
    expect(edited.verificationReport).toBeUndefined();
  });

  it('does not accept a stored report after executable input changes outside the report', async () => {
    const { root, boardId, taskId } = await fixture();
    const verified = await verifyTaskCompletion(root, boardId, taskId, {
      registry: passingRegistry(),
    });
    const edited = {
      ...verified.task,
      successCriteria: verified.task.successCriteria!.map((check) => ({
        ...check,
        notes: 'new-command',
      })),
    };
    expect(validateDefinitionOfDone(edited, verified.report).length).toBeGreaterThan(0);
  });

  it("creates managed copies with fresh criteria and without another task's report", async () => {
    const { root, boardId, taskId } = await fixture();
    await verifyTaskCompletion(root, boardId, taskId, { registry: passingRegistry() });
    const target = await createBoard(root, {
      title: 'Copy target',
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
    const copied = await copyTaskToBoard(root, boardId, taskId, target.id);
    expect(copied?.task.successCriteria?.[0]?.status).toBe('pending');
    expect(copied?.task.successCriteria?.[0]?.checkedAt).toBeUndefined();
    expect(copied?.task.verificationReport).toBeUndefined();
  });

  it('preserves explicitly requested check escalation when adding a criterion', async () => {
    const { root, boardId, taskId } = await fixture();
    await addCheckToTask(root, boardId, taskId, {
      description: 'Review with concrete proof',
      type: 'manual',
      escalation: 'council',
    });
    expect((await getBoard(root, boardId))?.tasks[0]?.successCriteria?.at(-1)?.escalation).toBe(
      'council',
    );
  });

  it('rejects a failed report on a leaf even if individual statuses are passed', () => {
    const check: KanbanCheck = {
      id: 'c1',
      description: 'Accepted',
      type: 'manual',
      status: 'passed',
    };
    const task = { id: 't1', title: 'Leaf', successCriteria: [check] } as KanbanTask;
    const report = buildVerificationReport({
      taskId: 't1',
      taskTitle: 'Leaf',
      boardId: 'b1',
      checks: [],
      fileScope: { expectedChanges: 1, actualChanges: 0, scopeMatches: false, files: [] },
    });
    expect(validateDefinitionOfDone(task, report).length).toBeGreaterThan(0);
  });

  it.each(['task', 'board', 'lease', 'attempt'] as const)(
    'rejects report ownership mismatch: %s',
    (field) => {
      const check: KanbanCheck = {
        id: 'c1',
        description: 'Accepted',
        type: 'manual',
        status: 'passed',
      };
      const task = {
        id: 't1',
        title: 'Task',
        atomic: true,
        successCriteria: [check],
        assignment: { leaseId: 'lease-2', attempt: 2 },
      } as KanbanTask;
      const board = { id: 'b1', tasks: [task] } as KanbanBoard;
      const report = buildVerificationReport({
        taskId: field === 'task' ? 'other' : 't1',
        taskTitle: 'Task',
        boardId: field === 'board' ? 'other' : 'b1',
        leaseId: field === 'lease' ? 'lease-1' : 'lease-2',
        attempt: field === 'attempt' ? 1 : 2,
        checks: [
          {
            checkId: 'c1',
            description: check.description,
            type: check.type,
            status: 'passed',
            evidence: {},
          },
        ],
      });
      expect(validateDefinitionOfDone(task, report, { board }).length).toBeGreaterThan(0);
    },
  );

  it('rejects unresolved children on non-atomic managed parents', () => {
    const check: KanbanCheck = {
      id: 'c1',
      description: 'Accepted',
      type: 'manual',
      status: 'passed',
    };
    const task = {
      id: 't1',
      title: 'Task',
      description: 'Complete details',
      assignee: 'owner',
      columnId: 'review',
      status: 'review',
      lifecycle: { currentStage: 'review' },
      successCriteria: [check],
      childTaskIds: ['deleted-child'],
      assignment: { lastResult: 'Implemented' },
    } as KanbanTask;
    const board = {
      id: 'b1',
      lifecycle: {
        mode: 'managed',
        columns: {
          backlog: 'backlog',
          todo: 'todo',
          running: 'running',
          review: 'review',
          done: 'done',
        },
      },
      columns: ['backlog', 'todo', 'running', 'review', 'done'].map((id, order) => ({
        id,
        title: id,
        order,
      })),
      tasks: [task],
    } as KanbanBoard;
    const issues = validateManagedTaskTransition(board, task, {
      to: 'done',
      actor: 'reviewer',
      comment: 'Accepted',
      action: 'Review complete',
    });
    expect(issues.some((issue) => issue.field === 'childTaskIds')).toBe(true);
  });

  it('does not overwrite a new lease with a verification from an older attempt', async () => {
    const { root, boardId, taskId } = await fixture();
    const registry = passingRegistry(async () => {
      await mutateBoard(root, boardId, (board) => {
        board.tasks[0]!.assignment = {
          agentId: 'successor',
          status: 'running',
          attempt: 2,
          leaseId: 'successor-lease',
        };
      });
    });
    await expect(verifyTaskCompletion(root, boardId, taskId, { registry })).rejects.toThrow(
      /Stale write detected/,
    );
    expect((await getBoard(root, boardId))?.tasks[0]?.assignment?.leaseId).toBe('successor-lease');
  });
});
