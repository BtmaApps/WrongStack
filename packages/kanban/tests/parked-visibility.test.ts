/**
 * A parked card must be visible on the surfaces that report a board.
 *
 * `applyGateRefusal` writes `task.park` once the verification budget is spent,
 * and that record is the only thing on the board saying "retrying this
 * unchanged is pointless". It is deliberately NOT a third status — a parked
 * managed card stays in Review, a parked legacy card stays `blocked` — so
 * every readiness and queue path keeps working. The cost of that choice is
 * that a parked card is otherwise indistinguishable from one merely waiting
 * its turn, and before these tests nothing that displays a board read the
 * field: not the queue classifier, not queue health, not the anomaly
 * vocabulary, not either Cleaner implementation.
 *
 * The Cleaner half is covered by `packages/cli/tests/kanban-cleaner-parity.test.ts`
 * (which is the only place both implementations are loaded together).
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { classifyTaskForQueue } from '../src/manager/task-classifier.js';
import {
  hasKanbanQueueAnomalies,
  kanbanQueueAnomalyCount,
  kanbanQueueAnomalySignals,
} from '../src/queue-anomalies.js';
import type { KanbanBoard, KanbanTask, KanbanTaskPark } from '../src/types.js';
import type { KanbanQueueHealth } from '../src/types-operations.js';
import {
  addCheckToTask,
  addTask,
  assignTask,
  createBoard,
  finalizeTaskCompletion,
  getKanbanQueueHealth,
  updateTaskAssignment,
} from './helpers/session-manager.js';

const NOW = '2026-09-16T00:00:00.000Z';

const PARK: KanbanTaskPark = {
  reason: 'Done requires every acceptance criterion to be explicitly passed.',
  parkedAt: NOW,
  attempts: 2,
};

function board(overrides: Partial<KanbanBoard> = {}): KanbanBoard {
  return {
    id: 'board-1',
    title: 'Board',
    columns: [
      { id: 'backlog', title: 'Backlog', order: 0 },
      { id: 'todo', title: 'Todo', order: 1 },
      { id: 'in-progress', title: 'Running', order: 2 },
      { id: 'review', title: 'Review', order: 3 },
      { id: 'done', title: 'Done', order: 4 },
    ],
    tasks: [],
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function task(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: 'task-1',
    title: 'Task',
    columnId: 'backlog',
    order: 0,
    priority: 'medium',
    status: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A queue-health record with every signal clear, for the anomaly assertions. */
function healthyRecord(): KanbanQueueHealth {
  return {
    generatedAt: NOW,
    boardIds: ['board-1'],
    counts: {
      ready: 0,
      startable: 0,
      queued: 0,
      running: 0,
      review: 0,
      failed: 0,
      completed: 0,
      pending: 0,
      archived: 0,
      blocked: 0,
    },
    dependencyBlocked: { count: 0, tasks: [] },
    staleAssignments: { count: 0, tasks: [] },
    failedRetryable: { count: 0, tasks: [] },
    heartbeatDue: { count: 0, tasks: [] },
  };
}

describe('classifyTaskForQueue — parked cards', () => {
  it('names the park, its budget and that a retry is pointless', () => {
    const parked = task({ status: 'blocked', park: PARK });
    const classification = classifyTaskForQueue(board({ tasks: [parked] }), parked, { now: NOW });

    const parkReason = classification.reasons.find((reason) => reason.startsWith('Parked after'));
    expect(parkReason).toBeDefined();
    expect(parkReason).toContain('2 refused completions');
    expect(parkReason).toContain(PARK.reason);
    expect(parkReason).toContain('Retrying it unchanged');
  });

  it('singularizes a one-refusal budget', () => {
    const parked = task({ status: 'blocked', park: { ...PARK, attempts: 1 } });
    const classification = classifyTaskForQueue(board({ tasks: [parked] }), parked, { now: NOW });
    expect(classification.reasons.at(-1)).toContain('1 refused completion:');
  });

  it('does not change the bucket a parked card lands in', () => {
    const plain = task({ status: 'blocked' });
    const parked = task({ status: 'blocked', park: PARK });
    expect(classifyTaskForQueue(board({ tasks: [parked] }), parked, { now: NOW }).bucket).toBe(
      classifyTaskForQueue(board({ tasks: [plain] }), plain, { now: NOW }).bucket,
    );
  });

  it('appends the park reason last so the primary reason stays first', () => {
    const managed = board({
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
    // A managed card outside Todo is stage-blocked; that is the reason a reader
    // acts on first, and it must not be displaced by the park note.
    const parked = task({ status: 'pending', columnId: 'backlog', park: PARK });
    managed.tasks = [parked];
    const classification = classifyTaskForQueue(managed, parked, { now: NOW });

    expect(classification.reasons[0]).toContain('not todo');
    expect(classification.reasons.at(-1)).toContain('Parked after');
  });

  it('says nothing extra about a card that is not parked', () => {
    const plain = task({ status: 'blocked' });
    const classification = classifyTaskForQueue(board({ tasks: [plain] }), plain, { now: NOW });
    expect(classification.reasons.some((reason) => reason.includes('Parked'))).toBe(false);
  });
});

describe('kanbanQueueAnomalySignals — parked cards', () => {
  it('reports a parked card as a live anomaly', () => {
    const health: KanbanQueueHealth = { ...healthyRecord(), parked: { count: 3, tasks: [] } };
    expect(kanbanQueueAnomalySignals(health)).toContainEqual({ code: 'parked', count: 3 });
    expect(hasKanbanQueueAnomalies(health)).toBe(true);
    expect(kanbanQueueAnomalyCount(health)).toBe(3);
  });

  it('ranks parked directly under a stale lease', () => {
    const health: KanbanQueueHealth = {
      ...healthyRecord(),
      staleAssignments: { count: 1, tasks: [] },
      parked: { count: 1, tasks: [] },
      counts: { ...healthyRecord().counts, failed: 1 },
    };
    expect(kanbanQueueAnomalySignals(health).map((signal) => signal.code)).toEqual([
      'stale_assignments',
      'parked',
      'failed',
    ]);
  });

  it('treats an absent parked record as zero, not as an anomaly', () => {
    // Several surfaces build a KanbanQueueHealth literal by hand and omit it.
    const health = healthyRecord();
    expect(health.parked).toBeUndefined();
    expect(hasKanbanQueueAnomalies(health)).toBe(false);
  });
});

describe('getKanbanQueueHealth — parked cards', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-parked-health-'));
  });

  /**
   * Drive a legacy strict-gate card into a real park through the gate itself,
   * rather than writing `task.park` by hand — the point of these three cases is
   * that health reads what the gate actually produces.
   *
   * Same shape as `refusableCard` in completion-park.test.ts: the card cannot
   * pass because its manual check stays pending, which refuses with the
   * budgeted `acceptance-criteria-incomplete`. A budget of 1 parks it on the
   * first `finalizeTaskCompletion`.
   */
  async function parkedCard(): Promise<{ boardId: string; taskId: string }> {
    const created = await createBoard(tmpDir, {
      title: 'Park visibility',
      completionGate: { enforcement: 'strict', maxVerificationAttempts: 1 },
    });
    const added = await addTask(tmpDir, created.id, { title: 'Refused task' });
    await addCheckToTask(tmpDir, created.id, added!.task.id, {
      description: 'Manually confirmed by reviewer',
      type: 'manual',
      status: 'pending',
    });
    await assignTask(tmpDir, created.id, added!.task.id, { agentId: 'worker' });
    await updateTaskAssignment(tmpDir, created.id, added!.task.id, { status: 'completed' });
    const outcome = await finalizeTaskCompletion(tmpDir, created.id, added!.task.id);
    expect(outcome?.gate.allowed).toBe(false);
    return { boardId: created.id, taskId: added!.task.id };
  }

  it('counts a parked card and carries it in the record', async () => {
    const { boardId, taskId } = await parkedCard();
    const health = await getKanbanQueueHealth(tmpDir, { boardId });

    expect(health.parked?.count).toBe(1);
    expect(health.parked?.tasks[0]?.task.id).toBe(taskId);
    expect(health.parked?.tasks[0]?.task.park?.reason).toBeTruthy();
  });

  it('makes the board read as needing attention', async () => {
    const { boardId } = await parkedCard();
    const health = await getKanbanQueueHealth(tmpDir, { boardId });
    expect(hasKanbanQueueAnomalies(health)).toBe(true);
  });

  it('reports no parked cards on a board with none', async () => {
    const created = await createBoard(tmpDir, { title: 'Clean' });
    await addTask(tmpDir, created.id, { title: 'Ordinary task' });
    const health = await getKanbanQueueHealth(tmpDir, { boardId: created.id });
    expect(health.parked?.count).toBe(0);
  });
});
