// The plan-file watcher must re-mirror the file refreshFiles actually reads —
// the resolved path (backlog.*.json under scope "project") — not only the
// session default path. `watch` is captured so no real fs events are involved.
import type { Context } from '@wrongstack/core/agent';
import { afterEach, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: string, file: string) => void),
}));
vi.mock('node:fs', async (orig) => ({
  ...(await orig<typeof import('node:fs')>()),
  watch: vi.fn((_dir: string, _opts: unknown, fn: (event: string, file: string) => void) => {
    fsMock.listener = fn;
    return { close() {}, on() {} };
  }),
}));
const loads = vi.hoisted(() => [] as string[]);
vi.mock('@wrongstack/core/storage', async (orig) => ({
  ...(await orig<typeof import('@wrongstack/core/storage')>()),
  loadPlan: vi.fn(async (path: string) => {
    loads.push(path);
    return null;
  }),
  loadTasks: vi.fn(async (path: string) => {
    loads.push(path);
    return null;
  }),
}));
vi.mock('@wrongstack/kanban', async (orig) => ({
  ...(await orig<typeof import('@wrongstack/kanban')>()),
  getBoard: vi.fn(async () => null),
  listBoards: vi.fn(async () => []),
  bridgeKanbanSupervisor: vi.fn(() => () => {}),
  touchKanbanPresence: vi.fn(async () => null),
}));

import {
  attachSessionKanbanMirror,
  settleSessionKanbanBackgroundWork,
} from '../src/session-kanban.js';

const dir = 'D:/watch-resolved-fixture/.wrongstack/sessions';
let detach: (() => void) | undefined;
afterEach(async () => {
  detach?.();
  vi.useRealTimers();
  await settleSessionKanbanBackgroundWork();
});

function context(meta: Record<string, unknown>): Context {
  return {
    projectRoot: 'D:/watch-resolved-fixture',
    meta,
    session: { id: 's1' },
    todos: [],
    state: { onChange: () => () => {}, replaceTodos: () => {} },
    setCurrentKanbanTask: () => {},
  } as unknown as Context;
}

async function fileChanged(name: string): Promise<string[]> {
  loads.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fsMock.listener?.('change', name);
  vi.advanceTimersByTime(100);
  vi.useRealTimers();
  await settleSessionKanbanBackgroundWork();
  return [...loads];
}

it('refreshes when the resolved project backlog changes, not on unrelated files', async () => {
  detach = attachSessionKanbanMirror(
    context({
      'plan.path': `${dir}/s1.plan.json`,
      'plan.path.resolved': `${dir}/backlog.plan.json`,
    }),
  );
  expect(await fileChanged('backlog.plan.json')).toEqual([`${dir}/backlog.plan.json`]);
  expect(await fileChanged('unrelated.json')).toEqual([]);
});

it('keeps the session file trigger when no resolved path is recorded', async () => {
  detach = attachSessionKanbanMirror(context({ 'task.path': `${dir}/s1.tasks.json` }));
  expect(await fileChanged('s1.tasks.json')).toEqual([`${dir}/s1.tasks.json`]);
});
