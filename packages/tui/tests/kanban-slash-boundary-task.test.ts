// `/kanban boundary … --task <query>` against the real kanban store: an
// ambiguous task-id prefix used to resolve to whichever task came first and
// silently cleared or rewrote THAT task's boundary policy.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { addTask, createBoard, getBoard } from '@wrongstack/kanban';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKanbanSlashCommand } from '../src/kanban-slash.js';

const SESSION = 'boundary-task-session';
let tmpDir: string;
let boardId: string;
let run: (args: string) => Promise<string>;

async function boundaryOf(taskId: string) {
  const board = await getBoard(tmpDir, boardId);
  return board?.tasks.find((t) => t.id === taskId)?.boundary;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-slash-boundary-'));
  const board = await createBoard(tmpDir, { title: 'sprint' });
  boardId = board.id;
  const command = createKanbanSlashCommand({ projectRoot: tmpDir, sessionId: SESSION } as never);
  run = async (args) => (await command.run(args))?.message ?? '';
  const columnId = board.columns[0]!.id;
  for (const [id, title] of [
    ['abc111-guarded', 'guarded'],
    ['abc222-other', 'other'],
    ['zz9-lone', 'abc'],
  ] as const) {
    await addTask(tmpDir, boardId, { id, title, columnId }, { actor: 'test', sessionId: SESSION });
    await run(`boundary sprint deny directory write secrets --task ${id}`);
  }
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('/kanban boundary --task resolution', () => {
  it('refuses an ambiguous id prefix without touching either task', async () => {
    expect(await run('boundary sprint clear --task ab')).toMatch(/matches 2 tasks/);
    expect(await boundaryOf('abc111-guarded')).toBeTruthy();
    expect(await boundaryOf('abc222-other')).toBeTruthy();
  });

  it('prefers an exact title over an id prefix', async () => {
    expect(await run('boundary sprint clear --task abc')).toMatch(/Removed task boundary/);
    expect(await boundaryOf('zz9-lone')).toBeUndefined();
    expect(await boundaryOf('abc111-guarded')).toBeTruthy();
    expect(await boundaryOf('abc222-other')).toBeTruthy();
  });

  it('resolves a unique id prefix and an exact id', async () => {
    expect(await run('boundary sprint clear --task abc1')).toMatch(/Removed task boundary/);
    expect(await boundaryOf('abc111-guarded')).toBeUndefined();
    expect(await run('boundary sprint clear --task abc222-other')).toMatch(/Removed/);
    expect(await boundaryOf('abc222-other')).toBeUndefined();
    expect(await run('boundary sprint clear --task nope')).toBe('Task not found: nope');
  });
});
