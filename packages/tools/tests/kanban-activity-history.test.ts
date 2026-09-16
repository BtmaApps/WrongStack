/**
 * Three reachability gaps closed: things the WebUI or the domain layer could do
 * that an agent holding the `kanban` tool could not.
 *
 * - `events` could not be scoped to a card. The only route to a card's own
 *   history was the whole board log, and the transcript serializer caps that at
 *   100 most-recent entries — so on a busy board an older card's events fell
 *   outside the window with no argument that could bring them back.
 * - `record_activity` did not exist. `kanban.task.activity.add` did, so the
 *   card's durable "what was attempted and how it went" stream was only ever
 *   written by a human watching the board.
 * - `board_history` did not exist. Board history is a separate global log that
 *   survives board deletion; the WebUI has read it since protocol v6.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { createBoard } from '@wrongstack/kanban';
import { addTask } from '@wrongstack/kanban/test-support';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kanbanTool } from '../src/kanban.js';
import type { KanbanToolInput } from '../src/kanban-tool-types.js';
import { newSignal } from './fixtures.js';
import { expectKanbanError } from './kanban-test-helpers.js';

const SID = '2026-09-16/sess_01TESTKANBANACTIVITYHIST0';

describe('kanban tool — task activity and board history', () => {
  let dir: string;
  const ctx = (extra: Record<string, unknown> = {}) =>
    ({
      eventSessionId: () => SID,
      projectRoot: dir,
      agentId: 'agent-1',
      ...extra,
    }) as unknown as Context;
  const run = (input: KanbanToolInput) => kanbanTool.execute(input, ctx(), { signal: newSignal() });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-kanban-activity-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('events scoped to a task', () => {
    it("returns only the named card's events, chronologically", async () => {
      const board = await createBoard(dir, { title: 'Busy' });
      const mine = await addTask(dir, board.id, { title: 'Mine' });
      const other = await addTask(dir, board.id, { title: 'Other' });
      await run({ action: 'add_note', boardId: board.id, taskId: mine!.task.id, note: 'first' });
      await run({ action: 'add_note', boardId: board.id, taskId: other!.task.id, note: 'noise' });
      await run({ action: 'add_note', boardId: board.id, taskId: mine!.task.id, note: 'second' });

      const scoped = await run({ action: 'events', boardId: board.id, taskId: mine!.task.id });

      expect(scoped.events?.every((event) => event.taskId === mine!.task.id)).toBe(true);
      expect(scoped.events?.some((event) => event.taskId === other!.task.id)).toBe(false);
      // Chronological, like the unscoped action — `listTaskActivity` hands back
      // newest-first, so a missing re-reverse would show up here.
      const timestamps = (scoped.events ?? []).map((event) => event.ts);
      expect([...timestamps].sort()).toEqual(timestamps);
      expect(scoped.message).toContain('Mine');
    });

    it('accepts a unique task id prefix, like every other action', async () => {
      const board = await createBoard(dir, { title: 'Prefixes' });
      const task = await addTask(dir, board.id, { title: 'Prefixed' });
      const scoped = await run({
        action: 'events',
        boardId: board.id,
        taskId: task!.task.id.slice(0, 8),
      });
      expect(scoped.events?.every((event) => event.taskId === task!.task.id)).toBe(true);
    });

    it('honours limit by keeping the most recent events', async () => {
      const board = await createBoard(dir, { title: 'Chatty' });
      const task = await addTask(dir, board.id, { title: 'Talked about' });
      for (const note of ['one', 'two', 'three']) {
        await run({ action: 'add_note', boardId: board.id, taskId: task!.task.id, note });
      }
      const all = await run({ action: 'events', boardId: board.id, taskId: task!.task.id });
      const limited = await run({
        action: 'events',
        boardId: board.id,
        taskId: task!.task.id,
        limit: 2,
      });
      expect(limited.events).toEqual(all.events!.slice(-2));
    });

    it('is NOT_FOUND for a task that is not on the board', async () => {
      const board = await createBoard(dir, { title: 'Empty' });
      await expectKanbanError(
        run({ action: 'events', boardId: board.id, taskId: 'no-such-task' }),
        'NOT_FOUND',
        'Task not found',
      );
    });

    it('still returns the whole board log when no task is named', async () => {
      const board = await createBoard(dir, { title: 'Whole' });
      const a = await addTask(dir, board.id, { title: 'A' });
      const b = await addTask(dir, board.id, { title: 'B' });
      const all = await run({ action: 'events', boardId: board.id });
      const ids = new Set((all.events ?? []).map((event) => event.taskId));
      expect(ids.has(a!.task.id)).toBe(true);
      expect(ids.has(b!.task.id)).toBe(true);
    });
  });

  describe('record_activity', () => {
    it('appends a typed activity event without editing the card', async () => {
      const board = await createBoard(dir, { title: 'Worked' });
      const task = await addTask(dir, board.id, {
        title: 'Do the thing',
        description: 'Original.',
      });

      const result = await run({
        action: 'record_activity',
        boardId: board.id,
        taskId: task!.task.id,
        activityKind: 'attempt',
        activityOutcome: 'failed',
        note: 'Ran the migration against staging',
        activityDetails: 'Timed out after 30s on the largest table.',
      });

      expect(result.ok).toBe(true);
      expect(result.message).toContain('attempt');
      expect(result.message).toContain('failed');

      const scoped = await run({ action: 'events', boardId: board.id, taskId: task!.task.id });
      const activity = scoped.events?.find((event) => event.type === 'task.activity.attempt');
      expect(activity).toBeDefined();
      expect(activity?.note).toBe('Ran the migration against staging');
      expect((activity?.after as { outcome?: string } | undefined)?.outcome).toBe('failed');

      // The card's own content is untouched — this is a log entry, not an edit.
      const reread = await run({ action: 'get_task', boardId: board.id, taskId: task!.task.id });
      expect(reread.task?.description).toBe('Original.');
      expect(reread.task?.title).toBe('Do the thing');
    });

    it('defaults the outcome rather than inventing one', async () => {
      const board = await createBoard(dir, { title: 'Observed' });
      const task = await addTask(dir, board.id, { title: 'Watch' });
      await run({
        action: 'record_activity',
        boardId: board.id,
        taskId: task!.task.id,
        activityKind: 'observation',
        note: 'The queue drains faster after 18:00.',
      });
      const scoped = await run({ action: 'events', boardId: board.id, taskId: task!.task.id });
      const activity = scoped.events?.find((event) => event.type === 'task.activity.observation');
      expect((activity?.after as { outcome?: string } | undefined)?.outcome).toBe('unknown');
    });

    it('requires a kind and a summary', async () => {
      const board = await createBoard(dir, { title: 'Strict' });
      const task = await addTask(dir, board.id, { title: 'Card' });
      await expectKanbanError(
        run({ action: 'record_activity', boardId: board.id, taskId: task!.task.id, note: 'x' }),
        'INVALID_INPUT',
        'activityKind',
      );
      await expectKanbanError(
        run({
          action: 'record_activity',
          boardId: board.id,
          taskId: task!.task.id,
          activityKind: 'result',
        }),
        'INVALID_INPUT',
        'note',
      );
    });

    it('is NOT_FOUND for a missing task, not a silent ok', async () => {
      const board = await createBoard(dir, { title: 'Gone' });
      await expectKanbanError(
        run({
          action: 'record_activity',
          boardId: board.id,
          taskId: 'no-such-task',
          activityKind: 'result',
          note: 'done',
        }),
        'NOT_FOUND',
        'Task not found',
      );
    });
  });

  describe('board_history', () => {
    it("reports a board's lifecycle and outlives its deletion", async () => {
      const board = await createBoard(dir, { title: 'Short-lived' });
      await run({ action: 'delete_board', boardId: board.id });

      const scoped = await run({ action: 'board_history', boardId: board.id });

      expect(scoped.ok).toBe(true);
      expect(scoped.history?.length).toBeGreaterThan(0);
      expect(scoped.history?.every((entry) => entry.boardId === board.id)).toBe(true);
      // The board itself is gone; the record of it is not.
      await expectKanbanError(run({ action: 'get_board', boardId: board.id }), 'NOT_FOUND');
      expect(scoped.history?.some((entry) => entry.boardTitle === 'Short-lived')).toBe(true);
    });

    it('covers every board when no boardId is given', async () => {
      const first = await createBoard(dir, { title: 'First' });
      const second = await createBoard(dir, { title: 'Second' });
      const all = await run({ action: 'board_history' });
      const ids = new Set((all.history ?? []).map((entry) => entry.boardId));
      expect(ids.has(first.id)).toBe(true);
      expect(ids.has(second.id)).toBe(true);
      expect(all.message).toContain('every board');
    });

    it('honours limit by keeping the most recent entries', async () => {
      await createBoard(dir, { title: 'A' });
      await createBoard(dir, { title: 'B' });
      await createBoard(dir, { title: 'C' });
      const all = await run({ action: 'board_history' });
      const limited = await run({ action: 'board_history', limit: 2 });
      expect(limited.history).toEqual(all.history!.slice(-2));
    });

    it('does not write to the board (it is a read action)', async () => {
      const board = await createBoard(dir, { title: 'Untouched' });
      const before = await run({ action: 'get_board', boardId: board.id });
      await run({ action: 'board_history', boardId: board.id });
      const after = await run({ action: 'get_board', boardId: board.id });
      expect(after.board?.revision).toBe(before.board?.revision);
    });
  });
});
