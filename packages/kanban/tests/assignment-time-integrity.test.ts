import { describe, expect, it } from 'vitest';
import { isAssignmentStale as claimIsStale } from '../src/manager/_internal.js';
import { isAssignmentStale } from '../src/manager/assignment.js';
import { classifyTaskForQueue } from '../src/manager/task-classifier.js';
import type { KanbanBoard, KanbanTask } from '../src/types.js';

describe('assignment expiry instants', () => {
  it.each(['running', 'queued'] as const)(
    'uses expiry instants in %s queue classification and claim recovery',
    (status) => {
      const now = '2026-10-03T11:00:00Z';
      for (const [leaseExpiresAt, expired] of [
        ['2026-10-03T13:00:00+03:00', true],
        ['2026-10-03T09:00:00-03:00', false],
      ] as const) {
        const task = {
          id: 'task',
          status: 'ready',
          assignment: { status, leaseId: 'lease', leaseExpiresAt },
        } as KanbanTask;
        const board = { tasks: [task] } as KanbanBoard;
        expect(classifyTaskForQueue(board, task, { now }).bucket).toBe(
          status === 'running'
            ? expired
              ? 'running_expired'
              : 'running_live'
            : expired
              ? 'queued_expired'
              : 'queued',
        );
        expect(claimIsStale(task.assignment, now)).toBe(expired);
      }
    },
  );
  it('recognizes an expired lease expressed with a positive timezone offset', () => {
    expect(
      isAssignmentStale(
        { status: 'running', leaseExpiresAt: '2026-10-03T13:00:00+03:00' },
        '2026-10-03T11:00:00Z',
      ),
    ).toBe(true);
  });
  it('does not recover a live lease expressed with a negative timezone offset', () => {
    expect(
      isAssignmentStale(
        { status: 'running', leaseExpiresAt: '2026-10-03T09:00:00-03:00' },
        '2026-10-03T11:00:00Z',
      ),
    ).toBe(false);
  });
  it('keeps the equal-instant expiry boundary for differently formatted timestamps', () => {
    expect(
      isAssignmentStale(
        { status: 'running', leaseExpiresAt: '2026-10-03T14:00:00+03:00' },
        '2026-10-03T11:00:00.000Z',
      ),
    ).toBe(true);
  });
  it('keeps the ordinary UTC expiry and non-running controls', () => {
    expect(
      isAssignmentStale(
        { status: 'running', leaseExpiresAt: '2026-10-03T10:00:00Z' },
        '2026-10-03T11:00:00Z',
      ),
    ).toBe(true);
    expect(
      isAssignmentStale(
        { status: 'completed', leaseExpiresAt: '2026-10-03T10:00:00Z' },
        '2026-10-03T11:00:00Z',
      ),
    ).toBe(false);
  });
  it('keeps stampless recovery tied to silence and the inclusive ten-minute boundary', () => {
    const now = '2026-10-03T11:00:00Z';
    expect(isAssignmentStale({ status: 'running', heartbeatAt: '2026-10-03T10:51:00Z' }, now)).toBe(
      false,
    );
    expect(isAssignmentStale({ status: 'running', claimedAt: '2026-10-03T10:50:00Z' }, now)).toBe(
      true,
    );
    expect(isAssignmentStale({ status: 'queued' }, now)).toBe(true);
    expect(isAssignmentStale(undefined, now)).toBe(false);
  });
});
