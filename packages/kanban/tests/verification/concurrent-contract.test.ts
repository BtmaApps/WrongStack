import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedLifecyclePolicy } from '../../src/manager/lifecycle.js';
import * as storage from '../../src/storage.js';
import { mutateBoard } from '../../src/storage.js';
import type { UpdateKanbanTaskInput } from '../../src/types-operations.js';
import { VerificationContext } from '../../src/verification/verification-context.js';
import { buildVerificationReport } from '../../src/verification/verification-report.js';
import { VerifierRegistry } from '../../src/verification/verifier-registry.js';
import {
  addCheckToTask,
  addDependency,
  addNoteToTask,
  addTask,
  attachVerificationReport,
  createBoard,
  finalizeTaskCompletion,
  getBoard,
  heartbeatTaskAssignment,
  removeCheckFromTask,
  splitTask,
  touchKanbanPresence,
  updateCheckOnTask,
  updateTask,
  verifyTaskCompletion,
} from '../helpers/session-manager.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(managed = false) {
  const root = await mkdtemp(join(tmpdir(), 'kanban-concurrent-contract-'));
  roots.push(root);
  vi.spyOn(VerificationContext.prototype, 'captureSnapshot').mockResolvedValue({
    id: 'baseline',
    capturedAt: new Date().toISOString(),
    commitHash: '',
    treeHash: '',
  });
  const board = await createBoard(root, {
    title: 'Contract',
    completionGate: { enforcement: 'strict' },
    ...(managed ? { lifecycle: createManagedLifecyclePolicy() } : {}),
  });
  const added = await addTask(root, board.id, {
    title: 'Accepted work',
    description: 'Original scope',
    successCriteria: [{ id: 'c1', type: 'manual', description: 'Reviewed', status: 'passed' }],
  });
  if (!added) throw new Error('Missing task');
  await mutateBoard(root, board.id, (current) => {
    const task = current.tasks[0]!;
    task.assignment = { agentId: 'worker', status: 'completed', leaseId: 'lease', attempt: 1 };
    if (managed) {
      task.status = 'completed';
      task.columnId = current.lifecycle!.columns.done;
      task.lifecycle = { currentStage: 'done', stageEnteredAt: task.updatedAt, history: [] };
    }
  });
  return { root, boardId: board.id, taskId: added.task.id };
}
function registry(hook: () => Promise<unknown>) {
  return new VerifierRegistry().register({
    id: 'controlled',
    kind: 'deterministic',
    canHandle: () => true,
    verify: async (check) => {
      await hook();
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

describe('in-flight verification contract', () => {
  it.each(['presence', 'heartbeat', 'note', 'other-task'] as const)(
    'allows %s during verification and preserves the concurrent write',
    async (write) => {
      const { root, boardId, taskId } = await fixture();
      const hook = async () => {
        if (write === 'presence')
          return touchKanbanPresence(root, boardId, { sessionId: 'reader', agentId: 'reader' });
        if (write === 'heartbeat')
          return heartbeatTaskAssignment(root, boardId, taskId, {
            expectedLeaseId: 'lease',
            heartbeatAt: '2026-10-03T01:00:00Z',
          });
        if (write === 'note')
          return addNoteToTask(root, boardId, taskId, {
            author: 'reviewer',
            content: 'Keep this note',
          });
        return addTask(root, boardId, { title: 'Other work' });
      };
      const result = await verifyTaskCompletion(root, boardId, taskId, {
        registry: registry(hook),
      });
      expect(result.report.verdict).toBe('passed');
      const current = (await getBoard(root, boardId))!;
      if (write === 'presence') expect(current.presence?.[0]?.agentId).toBe('reader');
      if (write === 'heartbeat')
        expect(current.tasks[0]?.assignment?.heartbeatAt).toBe('2026-10-03T01:00:00Z');
      if (write === 'note') expect(current.tasks[0]?.notes?.[0]?.content).toBe('Keep this note');
      if (write === 'other-task') expect(current.tasks).toHaveLength(2);
    },
  );
  it('allows heartbeat through the non-persisting gate and atomic finalization', async () => {
    const { root, boardId, taskId } = await fixture();
    const result = await finalizeTaskCompletion(root, boardId, taskId, {
      registry: registry(() =>
        heartbeatTaskAssignment(root, boardId, taskId, { expectedLeaseId: 'lease' }),
      ),
    });
    expect(result?.task.status).toBe('completed');
    expect(result?.task.assignment?.heartbeatAt).toBeDefined();
  });
  it.each(['criterion-status', 'policy', 'replacement-report', 'lease'] as const)(
    'rejects changed %s and keeps the newer state',
    async (write) => {
      const { root, boardId, taskId } = await fixture();
      const hook = () =>
        mutateBoard(root, boardId, (board) => {
          const task = board.tasks[0]!;
          if (write === 'criterion-status') task.successCriteria![0]!.status = 'failed';
          if (write === 'policy') board.completionGate = { enforcement: 'off' };
          if (write === 'lease') task.assignment!.leaseId = 'successor';
          if (write === 'replacement-report')
            task.verificationReport = buildVerificationReport({
              taskId,
              boardId,
              taskTitle: task.title,
              checks: [],
            });
        });
      await expect(
        verifyTaskCompletion(root, boardId, taskId, { registry: registry(hook) }),
      ).rejects.toThrow(/Stale write/);
    },
  );
  it.each(['heartbeat', 'lease', 'criterion'] as const)(
    'checks %s again in the final mutation after the gate returned',
    async (write) => {
      const { root, boardId, taskId } = await fixture();
      const original = storage.mutateBoard;
      vi.spyOn(storage, 'mutateBoard').mockImplementationOnce(async (project, id, callback) => {
        await original(project, id, (board) => {
          const task = board.tasks[0]!;
          if (write === 'heartbeat') task.assignment!.heartbeatAt = '2026-10-03T02:00:00Z';
          if (write === 'lease') task.assignment!.leaseId = 'successor';
          if (write === 'criterion') task.successCriteria![0]!.status = 'failed';
        });
        return original(project, id, callback);
      });
      const work = finalizeTaskCompletion(root, boardId, taskId, {
        registry: registry(async () => {}),
      });
      if (write === 'heartbeat') {
        const result = await work;
        expect(result?.task.status).toBe('completed');
        expect(result?.task.assignment?.heartbeatAt).toBe('2026-10-03T02:00:00Z');
      } else {
        await expect(work).rejects.toThrow(/Stale write/);
        expect((await getBoard(root, boardId))?.tasks[0]?.verificationReport).toBeUndefined();
      }
    },
  );
  it('rejects descendant changes while parent checks are running', async () => {
    const { root, boardId, taskId } = await fixture();
    const child = await addTask(root, boardId, { title: 'Child' });
    await updateTask(root, boardId, taskId, { atomic: true, childTaskIds: [child!.task.id] });
    const controlled = registry(() =>
      updateTask(root, boardId, child!.task.id, { description: 'Changed child scope' }),
    );
    await expect(
      verifyTaskCompletion(root, boardId, taskId, { registry: controlled }),
    ).rejects.toThrow(/Stale write/);
  });
});

describe('accepted managed contract', () => {
  const patches: UpdateKanbanTaskInput[] = [
    { title: 'New scope' },
    { description: 'Different requirement' },
    { atomic: true },
    { childTaskIds: ['missing-child'] },
    { expectedFileChanges: [{ path: 'new.ts', operation: 'create' }] },
    { successCriteria: [] },
    { successCriteria: [{ id: 'c1', type: 'manual', description: 'Reviewed', status: 'failed' }] },
  ];
  it.each(patches)('rejects a Done contract patch %j atomically', async (patch) => {
    const { root, boardId, taskId } = await fixture(true);
    const before = await getBoard(root, boardId);
    await expect(updateTask(root, boardId, taskId, patch)).rejects.toThrow(
      /Done.*contract|accepted.*contract/i,
    );
    expect(await getBoard(root, boardId)).toEqual(before);
  });
  it.each(['add', 'definition', 'status', 'remove'] as const)(
    'rejects criterion %s after Done',
    async (write) => {
      const { root, boardId, taskId } = await fixture(true);
      const before = await getBoard(root, boardId);
      const work =
        write === 'add'
          ? addCheckToTask(root, boardId, taskId, {
              description: 'New requirement',
              type: 'manual',
            })
          : write === 'remove'
            ? removeCheckFromTask(root, boardId, taskId, 'c1')
            : updateCheckOnTask(
                root,
                boardId,
                taskId,
                'c1',
                write === 'status' ? { status: 'failed' } : { description: 'New assertion' },
              );
      await expect(work).rejects.toThrow(/Done.*contract|accepted.*contract/i);
      expect(await getBoard(root, boardId)).toEqual(before);
    },
  );
  it('retains notes, labels and unchanged criteria on accepted work', async () => {
    const { root, boardId, taskId } = await fixture(true);
    await addNoteToTask(root, boardId, taskId, { author: 'reviewer', content: 'Useful context' });
    await updateTask(root, boardId, taskId, { labels: ['shipped'] });
    await updateCheckOnTask(root, boardId, taskId, 'c1', { status: 'passed' });
    expect((await getBoard(root, boardId))?.tasks[0]?.status).toBe('completed');
  });
  it('rejects replacing accepted evidence with another task passing report', async () => {
    const { root, boardId, taskId } = await fixture(true);
    const report = buildVerificationReport({
      taskId: 'another-task',
      boardId,
      taskTitle: 'Other work',
      checks: [],
    });
    const before = await getBoard(root, boardId);
    await expect(updateTask(root, boardId, taskId, { verificationReport: report })).rejects.toThrow(
      /Done.*contract/i,
    );
    expect(await getBoard(root, boardId)).toEqual(before);
  });
  it('keeps legacy completed tasks editable', async () => {
    const { root, boardId, taskId } = await fixture();
    await updateTask(root, boardId, taskId, { status: 'completed' });
    await updateCheckOnTask(root, boardId, taskId, 'c1', { description: 'Changed' });
    expect((await getBoard(root, boardId))?.tasks[0]?.successCriteria?.[0]?.description).toBe(
      'Changed',
    );
  });
  it.each(['dependency', 'split'] as const)(
    'rejects %s changing accepted work outside updateTask',
    async (method) => {
      const { root, boardId, taskId } = await fixture(true);
      const dependency = await addTask(root, boardId, {
        title: 'New dependency',
        description: 'More work',
      });
      const before = await getBoard(root, boardId);
      const work =
        method === 'dependency'
          ? addDependency(root, boardId, taskId, dependency!.task.id)
          : splitTask(root, boardId, taskId, { titles: ['New child'] });
      await expect(work).rejects.toThrow(/Done.*contract|accepted.*contract/i);
      expect(await getBoard(root, boardId)).toEqual(before);
    },
  );
});

it('updates different evidence with the same external verdict and completion timestamp', async () => {
  const { root, boardId, taskId } = await fixture();
  const report = buildVerificationReport({
    taskId,
    boardId,
    taskTitle: 'Accepted work',
    checks: [],
  });
  await attachVerificationReport(root, boardId, taskId, report);
  const replacement = {
    ...report,
    attachments: [{ kind: 'command_output' as const, label: 'New proof', content: 'new evidence' }],
  };
  await attachVerificationReport(root, boardId, taskId, replacement);
  expect((await getBoard(root, boardId))?.tasks[0]?.verificationReport?.attachments).toEqual(
    replacement.attachments,
  );
});
