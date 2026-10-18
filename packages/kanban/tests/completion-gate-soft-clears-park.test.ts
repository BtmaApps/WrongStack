import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addTask, createBoard } from '../src/manager.js';
import { finalizeTaskCompletion } from '../src/verification/completion-gate.js';
import { isParked } from '../src/verification/refusal-budget.js';

describe('finalizeTaskCompletion soft enforcement park cleanup', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0, dirs.length)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clears park metadata and verificationAttempts when a parked task completes under soft enforcement', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kanban-soft-park-'));
    dirs.push(tempDir);

    const board = await createBoard(tempDir, {
      title: 'Gate Board',
      completionGate: { enforcement: 'strict', maxVerificationAttempts: 1 },
    });

    const created = await addTask(
      tempDir,
      board.id,
      {
        title: 'Complete under soft override after strict park',
        successCriteria: [{ id: 'c1', type: 'manual', description: 'check', status: 'pending' }],
      },
      { sessionId: 'sess-1' },
    );
    expect(created).not.toBeNull();

    const strictBlocked = await finalizeTaskCompletion(tempDir, board.id, created!.task.id, {
      enforcement: 'strict',
      eventContext: { sessionId: 'sess-1' },
    });
    expect(strictBlocked).not.toBeNull();
    expect(isParked(strictBlocked!.task)).toBe(true);

    const softCompleted = await finalizeTaskCompletion(tempDir, board.id, created!.task.id, {
      enforcement: 'soft',
      eventContext: { sessionId: 'sess-1' },
    });
    expect(softCompleted).not.toBeNull();
    expect(softCompleted!.task.status).toBe('completed');
    expect(isParked(softCompleted!.task)).toBe(false);
    expect(softCompleted!.task.verificationAttempts).toBeUndefined();
    expect(softCompleted!.task.park).toBeUndefined();
  });
});
