/**
 * Regression: updateCheckOnTask must validate patch.status at runtime.
 *
 * The Done gate (validateDefinitionOfDone, definition-of-done.ts) refuses
 * Done when ANY criterion's .status is not 'passed'. updateCheckOnTask uses
 * Object.assign(check, patch) with no runtime check, so an IPC caller (or
 * any caller that bypasses the TypeScript type) can set check.status to an
 * arbitrary string — after which the card is permanently stranded in review.
 *
 * Valid KanbanCheckStatus values: 'pending' | 'passed' | 'failed' | 'skipped'.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addCheckToTask,
  addTask,
  createBoard,
  getBoard,
  removeCheckFromTask,
  updateCheckOnTask,
} from './helpers/session-manager.js';

const VALID_STATUSES = new Set(['pending', 'passed', 'failed', 'skipped']);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-round-1-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('updateCheckOnTask runtime validation', () => {
  it('rejects an invalid status string from a caller (IPC boundary trust gap)', async () => {
    const board = await createBoard(tmpDir, { title: 'Bug repro' });

    // Add a task via the real production path.
    const created = await addTask(
      tmpDir,
      board.id,
      { title: 'Repro task', description: 'A task to attach a criterion to' },
      { sessionId: 'test-session' },
    );
    const taskId = created?.task.id;
    expect(taskId).toBeDefined();

    // Seed a criterion via the real production path.
    const seeded = await addCheckToTask(
      tmpDir,
      board.id,
      taskId!,
      { description: 'Tests pass', type: 'manual' },
      { sessionId: 'test-session' },
    );
    const checkId = seeded?.tasks.find((t) => t.id === taskId)?.successCriteria?.[0]?.id;
    expect(checkId).toBeDefined();

    // Caller passes an invalid status — mimics a malformed IPC payload or a
    // caller that bypasses the TypeScript type.
    await updateCheckOnTask(
      tmpDir,
      board.id,
      taskId!,
      checkId!,
      // Cast to satisfy the type, mirroring an unvalidated IPC payload.
      { status: 'bogus' as 'pending' },
      { sessionId: 'test-session' },
    );

    // The function should reject the invalid status. Either:
    //  - throws/returns null, OR
    //  - persists a valid status (e.g. coerces, or ignores the bad field).
    // The bug is that it silently persists the invalid string.
    const after = await getBoard(tmpDir, board.id);
    const persisted = after?.tasks
      .find((t) => t.id === taskId)
      ?.successCriteria?.find((c) => c.id === checkId)?.status;
    expect(
      VALID_STATUSES,
      `updateCheckOnTask persisted invalid status '${persisted}'; ` +
        'an IPC caller can strand a card in review forever.',
    ).toContain(persisted);
  });

  it('recomputes atomicityAssessment when adding and removing checks on a task', async () => {
    const board = await createBoard(tmpDir, {
      title: 'Atomicity recompute',
      atomicity: { mode: 'enforce', decomposition: 'propose' },
    });
    const created = await addTask(
      tmpDir,
      board.id,
      {
        title: 'Implement auth flow',
        description: 'step 1; step 2; step 3; step 4; step 5',
        estimatedHours: 6,
        expectedFileChanges: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts'].map(
          (path) => ({ path, operation: 'modify' as const }),
        ),
      },
      { sessionId: 'test-session' },
    );
    const taskId = created!.task.id;
    expect(created?.task.atomicityAssessment?.verdict).toBe('needs_decomposition');

    const afterAdd = await addCheckToTask(
      tmpDir,
      board.id,
      taskId,
      { description: 'bun run test', type: 'test' },
      { sessionId: 'test-session' },
    );
    const taskAfterAdd = afterAdd?.tasks.find((t) => t.id === taskId);
    expect(taskAfterAdd?.atomicityAssessment?.verdict).toBe('borderline');

    const checkId = taskAfterAdd?.successCriteria?.[0]?.id;
    const afterRemove = await removeCheckFromTask(tmpDir, board.id, taskId, checkId!, {
      sessionId: 'test-session',
    });
    const taskAfterRemove = afterRemove?.tasks.find((t) => t.id === taskId);
    expect(taskAfterRemove?.atomicityAssessment?.verdict).toBe('needs_decomposition');
  });
});
