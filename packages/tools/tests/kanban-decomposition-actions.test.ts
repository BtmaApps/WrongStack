import { describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted — use only inline literals
vi.mock('@wrongstack/kanban', () => {
  const board = {
    id: 'board-1',
    title: 'Test Board',
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task',
        columnId: 'todo',
        order: 0,
        priority: 'medium',
        status: 'pending',
        successCriteria: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    columns: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
  return {
    assessTaskAtomicity: vi.fn().mockResolvedValue({
      board,
      assessment: {
        verdict: 'atomic',
        score: 1,
        criteria: [{ name: 'focused', score: 1, reason: 'ok' }],
      },
    }),
    proposeTaskDecomposition: vi.fn().mockResolvedValue({
      board,
      proposal: { status: 'applied', appliedChildTaskIds: ['c1', 'c2'] },
    }),
    updateTask: vi.fn().mockResolvedValue(board),
    resolveDecompositionProposal: vi.fn().mockResolvedValue({
      board,
      task: board.tasks[0],
      proposal: {
        id: 'proposal-1',
        status: 'applied',
        appliedChildTaskIds: ['c1', 'c2'],
      },
    }),
    verifyTaskCompletion: vi.fn().mockResolvedValue({
      report: {
        verdict: 'passed',
        markdownSummary: 'All criteria met.',
        checks: [],
        timestamp: Date.now(),
      },
      task: { id: 'task-1', successCriteria: ['done'] },
      board,
    }),
  };
});

vi.mock('../src/kanban-evidence-bridge.js', () => ({
  recordKanbanVerificationEvidence: vi.fn(),
}));

import { handleKanbanDecompositionAction } from '../src/kanban-decomposition-actions.js';
import { expectKanbanError } from './kanban-test-helpers.js';

const mockCtx = () =>
  ({
    agentId: 'test-agent',
    projectRoot: '/fake',
    // Board events are stamped with the session that owns the request.
    eventSessionId: () => '2026-08-26/sess_01TESTDECOMPOSITION000000',
  }) as never;

describe('handleKanbanDecompositionAction', () => {
  const projectRoot = '/fake/project';

  it('returns undefined for unknown action', async () => {
    const result = await handleKanbanDecompositionAction(
      projectRoot,
      { action: 'list_boards' as never },
      mockCtx(),
    );
    expect(result).toBeUndefined();
  });

  describe('assess_atomicity', () => {
    it('fails when required params missing', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(projectRoot, { action: 'assess_atomicity' }, mockCtx()),
        'INVALID_INPUT',
        'requires boardId and taskId',
      );
    });

    it('returns atomicity assessment with atomic verdict', async () => {
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        { action: 'assess_atomicity', boardId: 'b1', taskId: 't1' },
        mockCtx(),
      );
      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('verdict: atomic');
    });

    it('fails when task not found', async () => {
      const { assessTaskAtomicity } = await import('@wrongstack/kanban');
      vi.mocked(assessTaskAtomicity).mockResolvedValueOnce(null);
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          { action: 'assess_atomicity', boardId: 'b1', taskId: 't1' },
          mockCtx(),
        ),
        'NOT_FOUND',
        'Task not found',
      );
    });
  });

  describe('propose_decomposition', () => {
    it('fails when required params missing', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          { action: 'propose_decomposition' },
          mockCtx(),
        ),
        'INVALID_INPUT',
        'requires boardId, taskId, and subtasks',
      );
    });

    it('fails with fewer than 2 subtasks', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          {
            action: 'propose_decomposition',
            boardId: 'b1',
            taskId: 't1',
            subtasks: [{ title: 'Only one' }],
          },
          mockCtx(),
        ),
        'INVALID_INPUT',
        'at least two subtasks',
      );
    });

    it('fails with blank subtask title', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          {
            action: 'propose_decomposition',
            boardId: 'b1',
            taskId: 't1',
            subtasks: [{ title: '' }, { title: 'Valid' }],
          },
          mockCtx(),
        ),
        'INVALID_INPUT',
        'non-blank title',
      );
    });

    it('applies decomposition with valid subtasks', async () => {
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'propose_decomposition',
          boardId: 'b1',
          taskId: 't1',
          note: 'Rationale here',
          subtasks: [{ title: 'Sub 1' }, { title: 'Sub 2' }],
        },
        mockCtx(),
      );
      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('Decomposition applied');
    });

    it('returns pending message when proposal is not applied', async () => {
      const { proposeTaskDecomposition } = await import('@wrongstack/kanban');
      vi.mocked(proposeTaskDecomposition).mockResolvedValueOnce({
        board: {
          id: 'b1',
          tasks: [],
          columns: [],
          title: 'B',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        },
        task: {
          id: 't1',
          title: 'Test Task',
          columnId: 'todo',
          order: 0,
          priority: 'medium',
          status: 'pending',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        proposal: {
          id: 'proposal-1',
          taskId: 't1',
          status: 'proposed',
          mode: 'approval',
          proposedSubtasks: [{ title: 'Sub 1' }, { title: 'Sub 2' }],
          proposedAt: '2026-01-01T00:00:00.000Z',
          appliedChildTaskIds: [],
        },
      });
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'propose_decomposition',
          boardId: 'b1',
          taskId: 't1',
          subtasks: [{ title: 'Sub 1' }, { title: 'Sub 2' }],
        },
        mockCtx(),
      );
      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('awaiting approval');
    });
  });

  describe('approve_decomposition / reject_decomposition', () => {
    // An agent could propose a split but not resolve it: the tool told it to
    // use the WebUI (unreachable) or `update_task`, which writes
    // `task.decomposition` verbatim — recording an approval while skipping the
    // phase that creates the children.
    it('tells the caller how to resolve a pending proposal, and names it', async () => {
      const { proposeTaskDecomposition } = await import('@wrongstack/kanban');
      vi.mocked(proposeTaskDecomposition).mockResolvedValueOnce({
        board: {
          id: 'b1',
          tasks: [],
          columns: [],
          title: 'B',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        },
        task: {
          id: 't1',
          title: 'Test Task',
          columnId: 'todo',
          order: 0,
          priority: 'medium',
          status: 'pending',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        proposal: {
          id: 'proposal-9',
          taskId: 't1',
          status: 'proposed',
          mode: 'approval',
          proposedSubtasks: [{ title: 'Sub 1' }, { title: 'Sub 2' }],
          proposedAt: '2026-01-01T00:00:00.000Z',
          appliedChildTaskIds: [],
        },
      });
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'propose_decomposition',
          boardId: 'b1',
          taskId: 't1',
          subtasks: [{ title: 'Sub 1' }, { title: 'Sub 2' }],
        },
        mockCtx(),
      );
      expect(result?.message).toContain('approve_decomposition');
      expect(result?.message).toContain('proposal-9');
      // The two dead ends it used to name.
      expect(result?.message).not.toContain('WebUI');
      expect(result?.message).not.toContain('update_task');
    });

    it('fails without a proposalId', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          { action: 'approve_decomposition', boardId: 'b1', taskId: 't1' },
          mockCtx(),
        ),
        'INVALID_INPUT',
        'requires boardId, taskId, and proposalId',
      );
    });

    it('approves through the real path and reports the children it created', async () => {
      const { resolveDecompositionProposal } = await import('@wrongstack/kanban');
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'approve_decomposition',
          boardId: 'b1',
          taskId: 't1',
          proposalId: 'proposal-1',
        },
        mockCtx(),
      );
      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('2 child card(s) created');
      expect(vi.mocked(resolveDecompositionProposal).mock.calls.at(-1)?.[4]).toMatchObject({
        action: 'approve',
        resolvedBy: 'test-agent',
      });
    });

    it('passes subtasks as edits when approving', async () => {
      const { resolveDecompositionProposal } = await import('@wrongstack/kanban');
      await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'approve_decomposition',
          boardId: 'b1',
          taskId: 't1',
          proposalId: 'proposal-1',
          subtasks: [{ title: 'Edited 1' }, { title: 'Edited 2' }],
        },
        mockCtx(),
      );
      expect(vi.mocked(resolveDecompositionProposal).mock.calls.at(-1)?.[4]).toMatchObject({
        editedSubtasks: [{ title: 'Edited 1' }, { title: 'Edited 2' }],
      });
    });

    it('rejects with a reason and refuses subtask edits', async () => {
      const { resolveDecompositionProposal } = await import('@wrongstack/kanban');
      await handleKanbanDecompositionAction(
        projectRoot,
        {
          action: 'reject_decomposition',
          boardId: 'b1',
          taskId: 't1',
          proposalId: 'proposal-1',
          note: 'The card is already atomic.',
        },
        mockCtx(),
      );
      expect(vi.mocked(resolveDecompositionProposal).mock.calls.at(-1)?.[4]).toMatchObject({
        action: 'reject',
        reason: 'The card is already atomic.',
      });

      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          {
            action: 'reject_decomposition',
            boardId: 'b1',
            taskId: 't1',
            proposalId: 'proposal-1',
            subtasks: [{ title: 'A' }, { title: 'B' }],
          },
          mockCtx(),
        ),
        'INVALID_INPUT',
        'a rejection takes only a note',
      );
    });

    it('reports an already-resolved proposal as NOT_FOUND rather than ok', async () => {
      const { resolveDecompositionProposal } = await import('@wrongstack/kanban');
      vi.mocked(resolveDecompositionProposal).mockResolvedValueOnce(null);
      await expectKanbanError(
        handleKanbanDecompositionAction(
          projectRoot,
          {
            action: 'approve_decomposition',
            boardId: 'b1',
            taskId: 't1',
            proposalId: 'gone',
          },
          mockCtx(),
        ),
        'NOT_FOUND',
        'already be resolved',
      );
    });
  });

  describe('verify_completion', () => {
    it('fails when required params missing', async () => {
      await expectKanbanError(
        handleKanbanDecompositionAction(projectRoot, { action: 'verify_completion' }, mockCtx()),
        'INVALID_INPUT',
        'requires boardId and taskId',
      );
    });

    it('returns passed verdict on successful verification', async () => {
      const result = await handleKanbanDecompositionAction(
        projectRoot,
        { action: 'verify_completion', boardId: 'b1', taskId: 't1' },
        mockCtx(),
      );
      expect(result?.ok).toBe(true);
      expect(result?.verdict).toBe('passed');
      expect(result?.message).toContain('All criteria met');
    });
  });
});
