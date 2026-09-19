import type { Context } from '@wrongstack/core/agent';
import type { KanbanBoard } from '@wrongstack/kanban';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardKanbanManagement, rememberManagementRead } from '../src/kanban-management-guard.js';

const state = vi.hoisted(() => ({ board: null as KanbanBoard | null }));
vi.mock('@wrongstack/kanban', async () => ({
  getBoard: vi.fn(async () => state.board),
  managementTaskVersion: (await import('../../kanban/src/management-fence.js'))
    .managementTaskVersion,
}));
const ctx = {
  projectRoot: '/project',
  meta: { kanban: { boardId: 'b', managementToken: 'lease' } },
} as unknown as Context;
beforeEach(() => {
  state.board = {
    id: 'b',
    management: { lease: { token: 'lease', fingerprint: 'v1', expiresAt: Date.now() + 120_000 } },
    tasks: [{ id: 't', status: 'pending' }],
  } as KanbanBoard;
  rememberManagementRead(ctx, state.board);
});

describe('task manager tool boundary', () => {
  it('permits detail and pending criteria, rejects execution and fake passing evidence', async () => {
    await expect(
      guardKanbanManagement(
        { action: 'update_task', boardId: 'b', taskId: 't', description: 'Specific scope' },
        ctx,
      ),
    ).resolves.toBeUndefined();
    await expect(
      guardKanbanManagement(
        { action: 'add_check', boardId: 'b', taskId: 't', checkStatus: 'pending' },
        ctx,
      ),
    ).resolves.toBeUndefined();
    for (const action of [
      'start_task',
      'delete_task',
      'assign_task',
      'verify_completion',
      'approve_decomposition',
    ] as const) {
      await expect(
        guardKanbanManagement({ action, boardId: 'b', taskId: 't' }, ctx),
      ).rejects.toThrow('Task managers may only');
    }
    await expect(
      guardKanbanManagement(
        { action: 'update_task', boardId: 'b', taskId: 't', status: 'completed' },
        ctx,
      ),
    ).rejects.toThrow('only the description');
    await expect(
      guardKanbanManagement(
        { action: 'add_check', boardId: 'b', taskId: 't', checkStatus: 'passed' },
        ctx,
      ),
    ).rejects.toThrow('pending');
  });
  it('fences other boards, expired owners and worker-owned cards', async () => {
    await expect(
      guardKanbanManagement({ action: 'get_board', boardId: 'other' }, ctx),
    ).rejects.toThrow('assigned board');
    state.board!.tasks[0]!.status = 'in_progress';
    await expect(
      guardKanbanManagement(
        { action: 'update_task', boardId: 'b', taskId: 't', description: 'Changed scope' },
        ctx,
      ),
    ).rejects.toThrow('owned by a worker');
    rememberManagementRead(ctx, state.board!);
    await expect(
      guardKanbanManagement({ action: 'add_note', boardId: 'b', taskId: 't' }, ctx),
    ).resolves.toBeUndefined();
    state.board!.management!.lease!.expiresAt = Date.now() - 1;
    await expect(
      guardKanbanManagement({ action: 'add_note', boardId: 'b', taskId: 't' }, ctx),
    ).rejects.toThrow('live management lease');
  });
});
