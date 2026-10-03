import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kanban from '@wrongstack/kanban';
import type { SddBoardSnapshot, SddBoardTask } from '@wrongstack/sdd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKanbanRunMirror } from '../src/server/kanban-run-mirror.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
function snapshot(overrides: Partial<SddBoardTask> = {}): SddBoardSnapshot {
  return {
    runId: 'run',
    graphId: 'graph',
    specId: 'spec',
    title: 'Run',
    status: 'running',
    startedAt: 0,
    updatedAt: 1,
    progress: {
      total: 1,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      failed: 0,
      review: 0,
      completed: 1,
      percentComplete: 100,
      estimatedHours: 0,
      actualHours: 0,
    },
    wave: 0,
    columns: [],
    tasks: [
      {
        id: 'task',
        shortId: 't01',
        title: 'Work',
        description: 'Original',
        status: 'completed',
        displayStatus: 'completed',
        type: 'feature',
        priority: 'medium',
        deps: [],
        retries: 0,
        agentName: 'worker',
        provider: 'openai',
        model: 'model',
        completedAt: 100,
        verificationState: 'passed',
        verificationCommand: 'pnpm test original',
        verificationDetail: 'first proof',
        ...overrides,
      },
    ],
  };
}
async function fixture(broadcast: () => void = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'kanban-run-evidence-'));
  roots.push(root);
  let handler: ((payload: unknown) => void) | undefined;
  const mirror = createKanbanRunMirror({
    projectRoot: root,
    broadcast,
    events: {
      on: (_name: string, fn: (payload: unknown) => void) => {
        handler = fn;
        return () => {
          handler = undefined;
        };
      },
    } as never,
  });
  const emit = (value: SddBoardSnapshot) => handler!({ runId: 'run', snapshot: value });
  const board = async () => {
    const summary = (await kanban.listBoards(root)).find((item) => item.tags?.includes('run:run'));
    return summary ? kanban.getBoard(root, summary.id) : null;
  };
  return { root, mirror, emit, board };
}
describe('run projection integrity', () => {
  it('refreshes the command and evidence even when the verification verdict stays passed', async () => {
    const { mirror, emit, board } = await fixture();
    try {
      emit(snapshot());
      await mirror.flush();
      emit(
        snapshot({
          verificationCommand: 'pnpm test revised',
          verificationDetail: 'replacement proof',
        }),
      );
      await mirror.flush();
      expect((await board())?.tasks[0]?.verificationReport?.checks[0]).toMatchObject({
        description: 'SDD completion gate: pnpm test revised',
        evidence: { detail: 'replacement proof' },
      });
    } finally {
      mirror.dispose();
    }
  });
  it.each(['title', 'description', 'provider', 'completedAt'] as const)(
    'projects a changed %s without a status/model/verdict change',
    async (field) => {
      const { mirror, emit, board } = await fixture();
      try {
        emit(snapshot());
        await mirror.flush();
        const change = field === 'completedAt' ? { completedAt: 900 } : { [field]: 'Revised' };
        emit(snapshot(change));
        await mirror.flush();
        const task = (await board())!.tasks[0]!;
        if (field === 'title' || field === 'description') expect(task[field]).toBe('Revised');
        if (field === 'provider') expect(task.assignment?.provider).toBe('Revised');
        if (field === 'completedAt')
          expect(task.assignment?.completedAt).toBe(new Date(900).toISOString());
      } finally {
        mirror.dispose();
      }
    },
  );
  it('retries the same snapshot after a failed publication', async () => {
    let publications = 0;
    const { mirror, emit } = await fixture(() => {
      publications++;
      if (publications === 1) throw new Error('Transient broadcast failure');
    });
    try {
      emit(snapshot());
      await mirror.flush();
      emit(snapshot());
      await mirror.flush();
      expect(publications).toBeGreaterThan(1);
    } finally {
      mirror.dispose();
    }
  });
  it('skips an identical successfully published snapshot', async () => {
    let publications = 0;
    const { mirror, emit } = await fixture(() => {
      publications++;
    });
    try {
      emit(snapshot());
      await mirror.flush();
      const first = publications;
      emit(snapshot());
      await mirror.flush();
      expect(publications).toBe(first);
    } finally {
      mirror.dispose();
    }
  });
  it('serializes successive snapshots of one run so an old write cannot win', async () => {
    const original = kanban.syncBoardFromTaskGraph;
    let release!: () => void;
    let entered!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const spy = vi
      .spyOn(kanban, 'syncBoardFromTaskGraph')
      .mockImplementationOnce(async (...args) => {
        entered();
        await hold;
        return original(...args);
      });
    const { mirror, emit, board } = await fixture();
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    try {
      emit(snapshot());
      first = mirror.flush();
      await entry;
      emit(snapshot({ title: 'Newest', verificationDetail: 'newer proof' }));
      second = mirror.flush();
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await Promise.all([first, second]);
      mirror.dispose();
    }
    expect((await board())?.tasks[0]?.title).toBe('Newest');
  });
  it('projects Goal phase/task definition and timing changes with unchanged statuses', async () => {
    const { root, mirror } = await fixture();
    const state = (title: string, completedAt: number) => ({
      title: 'Goal',
      phases: [
        {
          id: 'phase',
          name: 'Build',
          tasks: [
            {
              id: 'work',
              title,
              description: title,
              status: 'completed',
              type: 'feature',
              priority: 'medium',
              assignee: 'worker',
              completedAt,
            },
          ],
        },
      ],
    });
    try {
      mirror.onGoalState('goal', state('Original', 100));
      await mirror.flush();
      mirror.onGoalState('goal', state('Revised', 900));
      await mirror.flush();
      const summary = (await kanban.listBoards(root)).find((item) =>
        item.tags?.includes('graph:goal'),
      )!;
      const task = (await kanban.getBoard(root, summary.id))!.tasks[0]!;
      expect(task.title).toBe('Revised');
      expect(task.description).toBe('Revised');
      expect(task.assignment?.completedAt).toBe(new Date(900).toISOString());
    } finally {
      mirror.dispose();
    }
  });
});
