/**
 * Done-marker classification across the goal TUI surfaces.
 *
 * Contract: a deliverable is done only when its marker (✅ / [x] / [✓] /
 * (done)) is a PREFIX — canonical DONE_PREFIX in
 * packages/core/src/storage/goal-coordination.ts; every producer writes
 * `✅ ${item}`. These tests pin that ✅/(done) appearing MID-STRING in a
 * pending deliverable never counts as done in:
 *   - GoalPanel (F9 overlay checklist, goal-panel.tsx isDone)
 *   - GoalKanbanPanel (progress header %, goal-kanban-panel.tsx)
 *   - GoalPanelSidebar (DELIVERABLES badge + row state, sidebar-panels-task.tsx)
 */
import type { KanbanBoard, KanbanTask } from '@wrongstack/kanban';
import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalSummary } from '../src/app-state.js';
import { GoalKanbanPanel } from '../src/components/goal-kanban-panel.js';
import { GoalPanel } from '../src/components/goal-panel.js';
import { GoalPanelSidebar } from '../src/components/sidebar-panels-task.js';
import { waitForFrame } from './helpers/frame-wait.js';

const mocks = vi.hoisted(() => ({
  getBoard: vi.fn(),
  listBoards: vi.fn(),
}));

vi.mock('@wrongstack/kanban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/kanban')>();
  return { ...actual, getBoard: mocks.getBoard, listBoards: mocks.listBoards };
});

const NOW = '2026-07-30T00:00:00.000Z';
const PENDING_WITH_MIDSTRING_EMOJI = 'Mention ✅ in the changelog';
const PENDING_WITH_MIDSTRING_DONE = 'Migrate the (done) callback';

afterEach(() => {
  vi.clearAllMocks();
});

describe('GoalPanel deliverable done-marker', () => {
  it('keeps a mid-string ✅ deliverable pending', async () => {
    const view = render(
      React.createElement(GoalPanel, {
        goal: {
          goal: 'Build a REST API',
          goalState: 'active',
          iterations: 0,
          deliverables: [PENDING_WITH_MIDSTRING_EMOJI, 'Write tests'],
        } as GoalSummary,
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('DELIVERABLES'));
    expect(frame).toContain('DELIVERABLES 0/2');
    expect(frame).toContain(`○ ${PENDING_WITH_MIDSTRING_EMOJI}`);
    expect(frame).not.toContain(`✓ ${PENDING_WITH_MIDSTRING_EMOJI}`);
    view.unmount();
  });

  it('marks prefix ✅ deliverables done (control)', async () => {
    const view = render(
      React.createElement(GoalPanel, {
        goal: {
          goal: 'Build a REST API',
          goalState: 'active',
          iterations: 0,
          deliverables: ['✅ Ship v1', 'Write tests'],
        } as GoalSummary,
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('DELIVERABLES'));
    expect(frame).toContain('DELIVERABLES 1/2');
    // GoalPanel renders the raw deliverable text (prefix marker included)
    // next to its own state marker.
    expect(frame).toContain('✓ ✅ Ship v1');
    expect(frame).toContain('○ Write tests');
    view.unmount();
  });
});

describe('GoalKanbanPanel derived progress', () => {
  const board: KanbanBoard = {
    id: 'goal-board',
    title: '🎯 Coverage',
    tags: [' goal:cover-everything '],
    columns: [
      { id: 'todo', title: 'Backlog', order: 0 },
      { id: 'doing', title: 'In Progress', order: 1 },
      { id: 'done', title: 'Done', order: 2 },
    ],
    tasks: [
      {
        id: 'pending',
        title: 'Task pending',
        columnId: 'todo',
        order: 0,
        priority: 'medium',
        status: 'pending',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies KanbanTask,
    ],
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };

  it('derives 0% when the only done-looking text is mid-string ✅', async () => {
    mocks.listBoards.mockResolvedValue([board]);
    mocks.getBoard.mockResolvedValue(board);
    const view = render(
      React.createElement(GoalKanbanPanel, {
        projectRoot: 'D:/repo',
        goal: {
          goal: 'Cover everything',
          goalState: 'active',
          iterations: 0,
          deliverables: [PENDING_WITH_MIDSTRING_EMOJI, 'Write tests'],
        } as GoalSummary,
        onClose: vi.fn(),
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('Backlog'));
    expect(frame).toContain('0%');
    expect(frame).not.toContain('50%');
    view.unmount();
  });

  it('derives 50% from a prefix ✅ deliverable (control)', async () => {
    mocks.listBoards.mockResolvedValue([board]);
    mocks.getBoard.mockResolvedValue(board);
    const view = render(
      React.createElement(GoalKanbanPanel, {
        projectRoot: 'D:/repo',
        goal: {
          goal: 'Cover everything',
          goalState: 'active',
          iterations: 0,
          deliverables: ['✅ Ship v1', 'Write tests'],
        } as GoalSummary,
        onClose: vi.fn(),
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('Backlog'));
    expect(frame).toContain('50%');
    view.unmount();
  });
});

describe('GoalPanelSidebar deliverables badge', () => {
  it('counts a mid-string (done) deliverable as pending', async () => {
    const view = render(
      React.createElement(GoalPanelSidebar, {
        goal: {
          goal: 'Build a REST API',
          goalState: 'active',
          iterations: 0,
          deliverables: [PENDING_WITH_MIDSTRING_DONE, 'Write tests'],
        } as GoalSummary,
        coordinatorRunning: false,
        width: 48,
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('DELIVERABLES'));
    expect(frame).toContain('0/2');
    expect(frame).not.toContain('1/2');
    view.unmount();
  });

  it('counts a prefix ✅ deliverable as done (control)', async () => {
    const view = render(
      React.createElement(GoalPanelSidebar, {
        goal: {
          goal: 'Build a REST API',
          goalState: 'active',
          iterations: 0,
          deliverables: ['✅ Ship v1', 'Write tests'],
        } as GoalSummary,
        coordinatorRunning: false,
        width: 48,
      }),
    );
    const frame = await waitForFrame(view, (f) => f.includes('DELIVERABLES'));
    expect(frame).toContain('1/2');
    view.unmount();
  });
});
