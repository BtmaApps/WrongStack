import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { managementTaskVersion } from '../src/management-fence.js';
import {
  claimBoardManagement,
  finishBoardManagement,
  renewBoardManagement,
} from '../src/manager/management.js';
import type { KanbanEventContext } from '../src/types.js';
import {
  addCheckToTask,
  addLinkToTask,
  addNoteToTask,
  addTask,
  createBoard,
  getBoard,
  proposeTaskDecomposition,
  updateBoard,
  updateTask,
} from './helpers/session-manager.js';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('durable board management ownership', () => {
  it('rechecks legacy success checkpoints that predate per-card review coverage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-legacy-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const { mutateBoard } = await import('../src/storage.js');
    await mutateBoard(root, board.id, (current) => {
      current.management = { status: 'completed', reviewedFingerprint: 'v1' };
    });
    expect(
      await claimBoardManagement(root, board.id, {
        token: 'manager',
        fingerprint: 'v1',
        cooldownMs: 0,
      }),
    ).toBe(true);
  });
  it('does not mark an active board reviewed merely because the agent says completed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-coverage-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    await addTask(root, board.id, { title: 'Uninspected work' });
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    await finishBoardManagement(root, board.id, 'manager', {
      status: 'completed',
      result: 'Everything looks good.',
    });
    const stored = (await getBoard(root, board.id))!;
    expect(stored.management?.status).toBe('failed');
    expect(stored.management?.reviewedFingerprint).toBeUndefined();
    expect(stored.management?.error).toContain('review');
  });
  it('does not duplicate the same manager note, criterion or evidence link on a repeated review', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-repeat-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const created = await addTask(root, board.id, { title: 'Search' });
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    const fence = async () => {
      const read = (await getBoard(root, board.id))!;
      return {
        sessionId: 'manager-session',
        expectedManagementToken: 'manager',
        expectedManagementTaskVersions: {
          [created!.task.id]: managementTaskVersion(read, read.tasks[0]!),
        },
      };
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      await addNoteToTask(
        root,
        board.id,
        created!.task.id,
        { author: 'kanban-manager', content: 'Needs a reproduction.' },
        await fence(),
      );
      await addCheckToTask(
        root,
        board.id,
        created!.task.id,
        { description: 'Search finds the fixture', type: 'manual' },
        await fence(),
      );
      await addLinkToTask(
        root,
        board.id,
        created!.task.id,
        { url: 'docs/search.md', type: 'file', title: 'Spec' },
        await fence(),
      );
    }
    const task = (await getBoard(root, board.id))!.tasks[0]!;
    expect(task.notes).toHaveLength(1);
    expect(task.successCriteria).toHaveLength(1);
    expect(task.links).toHaveLength(1);
  });
  it('preserves concurrent human edits and permits renewal without invalidating the read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-cas-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const created = await addTask(root, board.id, { title: 'Search', description: 'Original' });
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    const read = (await getBoard(root, board.id))!;
    const fence = {
      sessionId: 'manager-session',
      expectedManagementToken: 'manager',
      expectedManagementTaskVersions: {
        [created!.task.id]: managementTaskVersion(read, read.tasks[0]!),
      },
    };
    await renewBoardManagement(root, board.id, 'manager');
    await addNoteToTask(
      root,
      board.id,
      created!.task.id,
      { author: 'kanban-manager', content: 'Observed source' },
      fence,
    );
    const reread = (await getBoard(root, board.id))!;
    fence.expectedManagementTaskVersions[created!.task.id] = managementTaskVersion(
      reread,
      reread.tasks[0]!,
    );
    await updateTask(root, board.id, created!.task.id, { description: 'Human clarification' });
    await expect(
      updateTask(root, board.id, created!.task.id, { description: 'Stale manager text' }, fence),
    ).rejects.toThrow('changed');
    expect((await getBoard(root, board.id))!.tasks[0]!.description).toBe('Human clarification');
  });

  it('refuses contract edits on parked cards without resetting their refusal budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-park-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const created = await addTask(root, board.id, { title: 'Search' });
    const { mutateBoard } = await import('../src/storage.js');
    await mutateBoard(root, board.id, (current) => {
      current.tasks[0]!.park = {
        reason: 'Needs input',
        attempts: 3,
        parkedAt: new Date().toISOString(),
      } as NonNullable<typeof created>['task']['park'];
    });
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    await expect(
      addCheckToTask(
        root,
        board.id,
        created!.task.id,
        { description: 'New criterion', type: 'manual' },
        { sessionId: 'manager-session', expectedManagementToken: 'manager' },
      ),
    ).rejects.toThrow('parked');
    expect((await getBoard(root, board.id))!.tasks[0]!.park?.attempts).toBe(3);
  });
  it('rejects a manager write after a worker claims the card, even if the earlier tool check passed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-race-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const created = await addTask(root, board.id, {
      title: 'Implement search',
      description: 'Original scope',
    });
    const taskId = created!.task.id;
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    await updateTask(root, board.id, taskId, { status: 'in_progress' });
    const eventContext = {
      sessionId: 'manager-session',
      expectedManagementToken: 'manager',
    } as KanbanEventContext;
    await expect(
      updateTask(root, board.id, taskId, { description: 'Outdated rewrite' }, eventContext),
    ).rejects.toThrow(/manager|worker|changed/i);
    expect((await getBoard(root, board.id))!.tasks[0]!.description).toBe('Original scope');
  });

  it('keeps manager decomposition as a proposal even on an automatic board', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-proposal-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    await updateBoard(root, board.id, { atomicity: { mode: 'assess', decomposition: 'auto' } });
    const created = await addTask(root, board.id, { title: 'Large feature' });
    await claimBoardManagement(root, board.id, {
      token: 'manager',
      fingerprint: 'v1',
      cooldownMs: 0,
    });
    const result = await proposeTaskDecomposition(
      root,
      board.id,
      created!.task.id,
      {
        subtasks: [{ title: 'First part' }, { title: 'Second part' }],
      },
      {
        sessionId: 'manager-session',
        expectedManagementToken: 'manager',
        expectedManagementTaskVersions: {
          [created!.task.id]: managementTaskVersion(
            (await getBoard(root, board.id))!,
            created!.task,
          ),
        },
      },
    );
    expect(result?.proposal.status).toBe('proposed');
    expect((await getBoard(root, board.id))!.tasks).toHaveLength(1);
  });
  it('admits only one host, fences stale completion and remembers reviewed inputs across hosts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    const claims = await Promise.all(
      ['a', 'b'].map((token) =>
        claimBoardManagement(root, board.id, { token, fingerprint: 'v1', cooldownMs: 0 }),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const token = claims[0] ? 'a' : 'b';
    expect(await finishBoardManagement(root, board.id, 'stale', { status: 'completed' })).toBe(
      false,
    );
    expect(await renewBoardManagement(root, board.id, token)).toBe(true);
    expect(
      await finishBoardManagement(root, board.id, token, {
        status: 'completed',
        result: 'Reviewed',
      }),
    ).toBe(true);
    expect((await getBoard(root, board.id))?.management?.summary).toBe('Reviewed');
    expect(
      await claimBoardManagement(root, board.id, {
        token: 'new-host',
        fingerprint: 'v1',
        cooldownMs: 0,
      }),
    ).toBe(false);
    expect(
      await claimBoardManagement(root, board.id, {
        token: 'new-host',
        fingerprint: 'v2',
        cooldownMs: 0,
      }),
    ).toBe(true);
  });

  it('recovers a dead host after lease expiry and does not accept its late result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kanban-manager-'));
    roots.push(root);
    const board = await createBoard(root, { title: 'Work' });
    await claimBoardManagement(root, board.id, { token: 'dead', fingerprint: 'v1', cooldownMs: 0 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 121_000);
    expect(await renewBoardManagement(root, board.id, 'dead')).toBe(false);
    expect(
      await claimBoardManagement(root, board.id, {
        token: 'new',
        fingerprint: 'v1',
        cooldownMs: 0,
      }),
    ).toBe(true);
    expect(await finishBoardManagement(root, board.id, 'dead', { status: 'completed' })).toBe(
      false,
    );
    expect((await getBoard(root, board.id))?.management?.lease?.token).toBe('new');
  });
});
