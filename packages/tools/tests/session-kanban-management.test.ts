import type { Context } from '@wrongstack/core/agent';
import type { KanbanBoard } from '@wrongstack/kanban';
import { expect, it, vi } from 'vitest';
import { deliverKanbanManagementReview } from '../src/session-kanban-management.js';

it('delivers a durable management review once to its owning leader without waking a new turn', () => {
  const append = vi.fn(() => true);
  const appendMessage = vi.fn();
  const context = {
    session: { id: 's' },
    state: { appendBlockToLastUserMessage: append, appendMessage },
  } as unknown as Context;
  const board = {
    id: 'b',
    tags: ['session:s'],
    management: {
      status: 'completed',
      lastCompletedAt: 1,
      summary: 'Task t needs a failing reproduction before implementation.',
    },
  } as KanbanBoard;
  deliverKanbanManagementReview(context, board);
  deliverKanbanManagementReview(context, board);
  expect(append).toHaveBeenCalledTimes(1);
  expect(append).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('failing reproduction') }),
  );
  board.management!.lastCompletedAt = 2;
  board.tags = ['session:another'];
  deliverKanbanManagementReview(context, board);
  expect(append).toHaveBeenCalledTimes(1);
  board.tags = ['session:s'];
  append.mockReturnValue(false);
  deliverKanbanManagementReview(context, board);
  expect(appendMessage).not.toHaveBeenCalled();
});
