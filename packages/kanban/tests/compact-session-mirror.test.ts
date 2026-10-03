/**
 * Tests for compactSessionMirrorBoard — bounding a session mirror's card count.
 *
 * Compaction exists to keep a live session board cheap: it drops the oldest
 * terminal (archived / completed) cards past a limit, keeps every card still
 * carrying open work, and keeps any card a retained card depends on so
 * readiness stays computable.
 *
 * It is a SIZE bound. It must never change what a retained card means — in
 * particular it must not re-decide whether a retained card is blocked.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compactSessionMirrorBoard } from '../src/manager/prune.js';
import { addTask as addTaskOrNull, createBoard, getBoard } from './helpers/session-manager.js';

async function addTask(...args: Parameters<typeof addTaskOrNull>) {
  const added = await addTaskOrNull(...args);
  if (!added) throw new Error('Compaction fixture task could not be created.');
  return added;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'kanban-compact-mirror-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** `normalizeBoardKind` classifies these tags as a `session_mirror`. */
async function makeSessionMirror() {
  return createBoard(tmpDir, {
    title: 'Session mirror',
    tags: ['session', 'session-work'],
  });
}

describe('compactSessionMirrorBoard', () => {
  it('drops the oldest terminal cards past the limit', async () => {
    const board = await makeSessionMirror();
    const old = await addTask(tmpDir, board.id, { title: 'Old done', status: 'completed' });
    const fresh = await addTask(tmpDir, board.id, { title: 'Fresh done', status: 'completed' });
    const open = await addTask(tmpDir, board.id, { title: 'Still open' });

    // Age the first card so it sorts first.
    const current = await getBoard(tmpDir, board.id);
    const aged = current!.tasks.find((task) => task.id === old.task.id)!;
    aged.updatedAt = '2020-01-01T00:00:00.000Z';
    await addTask(tmpDir, board.id, { title: 'ignored' }).catch(() => undefined);

    const result = await compactSessionMirrorBoard(tmpDir, board.id, { limit: 1 });
    expect(result?.removedTaskIds).toEqual([old.task.id]);

    const after = await getBoard(tmpDir, board.id);
    const ids = after!.tasks.map((task) => task.id);
    expect(ids).toContain(fresh.task.id);
    expect(ids).toContain(open.task.id);
    expect(ids).not.toContain(old.task.id);
  });

  it('never drops a card a retained card still depends on', async () => {
    const board = await makeSessionMirror();
    const blocker = await addTask(tmpDir, board.id, { title: 'Blocker', status: 'completed' });
    const waiter = await addTask(tmpDir, board.id, {
      title: 'Waiting',
      status: 'ready',
      dependsOn: [blocker.task.id],
    });
    await addTask(tmpDir, board.id, { title: 'Spare', status: 'completed' });

    const result = await compactSessionMirrorBoard(tmpDir, board.id, { limit: 0 });

    // The dependency of a retained (non-terminal) card is protected, so the
    // droppable pool was the spare card only.
    expect(result?.removedTaskIds).not.toContain(blocker.task.id);
    const after = await getBoard(tmpDir, board.id);
    expect(after!.tasks.map((task) => task.id)).toContain(waiter.task.id);
  });

  // ff1f19d9f added a repair pass that re-stamped affected cards and, when a
  // card was `blocked` with its dependencies met, rewrote it to `ready`.
  // Membership in `affectedTasks` only means "this card lost a REFERENCE to a
  // dropped card" — it says nothing about why the card was blocked. A card an
  // operator blocked (or one held by a park or a review) satisfies
  // areDependenciesMet simply by having no unmet dependsOn, so the pass made
  // deliberately blocked work claimable again — and since isTaskReadyForWork
  // accepts ['pending','ready'], dispatch would pick it up. A size-bounding
  // sweep must not re-decide a retained card's blocking reason.
  it('leaves a blocked card blocked when it merely loses a reference to a dropped card', async () => {
    const board = await makeSessionMirror();
    const child = await addTask(tmpDir, board.id, { title: 'Done child', status: 'completed' });
    const blocked = await addTask(tmpDir, board.id, {
      title: 'Deliberately blocked',
      status: 'blocked',
      childTaskIds: [child.task.id],
    });

    const result = await compactSessionMirrorBoard(tmpDir, board.id, { limit: 0 });
    expect(result?.removedTaskIds).toContain(child.task.id);

    const after = await getBoard(tmpDir, board.id);
    const still = after!.tasks.find((task) => task.id === blocked.task.id);
    expect(still?.status).toBe('blocked');
    // And it must not be advertised as startable.
    expect(still?.columnId).not.toBe('todo');
  });

  // The neighbouring control: a blocked card that loses NO reference must also
  // keep its status. Same input shape, same compaction — only the lost
  // reference differs.
  it('CONTROL: a blocked card that loses no reference keeps its blocked status', async () => {
    const board = await makeSessionMirror();
    await addTask(tmpDir, board.id, { title: 'Done card', status: 'completed' });
    const blocked = await addTask(tmpDir, board.id, {
      title: 'Unrelated blocked card',
      status: 'blocked',
    });

    const result = await compactSessionMirrorBoard(tmpDir, board.id, { limit: 0 });
    expect(result?.removedTaskIds).toHaveLength(1);

    const after = await getBoard(tmpDir, board.id);
    const still = after!.tasks.find((task) => task.id === blocked.task.id);
    expect(still?.status).toBe('blocked');
  });

  it('still re-stamps the atomicity assessment of an affected card', async () => {
    const board = await makeSessionMirror();
    const boardWithAtomicity = await createBoard(tmpDir, {
      title: 'Enforcing mirror',
      tags: ['session', 'session-work'],
      atomicity: { mode: 'enforce', decomposition: 'propose' },
    });
    expect(boardWithAtomicity).toBeTruthy();

    const child = await addTask(tmpDir, boardWithAtomicity.id, {
      title: 'Done child',
      status: 'completed',
    });
    const parent = await addTask(tmpDir, boardWithAtomicity.id, {
      title: 'Parent',
      childTaskIds: [child.task.id],
    });

    await compactSessionMirrorBoard(tmpDir, boardWithAtomicity.id, { limit: 0 });

    // The legitimate half of the repair pass is untouched: a DERIVED value is
    // recomputed for a card whose shape changed (its child is gone).
    const after = await getBoard(tmpDir, boardWithAtomicity.id);
    const still = after!.tasks.find((task) => task.id === parent.task.id);
    expect(still?.childTaskIds ?? []).toHaveLength(0);
    expect(still?.atomicityAssessment).toBeDefined();
    expect(board.id).toBeTruthy();
  });
});
