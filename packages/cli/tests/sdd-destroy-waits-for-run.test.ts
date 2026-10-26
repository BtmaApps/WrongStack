import { expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
const destroyed = vi.hoisted(() => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
});
vi.mock('@wrongstack/sdd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/sdd')>()),
  destroySddProject: vi.fn(async () => {
    order.push('destroy');
    destroyed.resolve();
    return { removed: 0, deleted: [] };
  }),
}));

import { createSddHandlers } from '../src/wiring/sdd-handlers.js';

// stop() flips isRunning() at once while the run still drains workers (which
// can squash-merge) and writes its final board. Destroy wiped worktrees and
// boards in that window: the revert missed the late merge and the run
// re-created what destroy had just removed.
it('waits for a stopped SDD run to settle before destroying its artifacts', async () => {
  await import('@wrongstack/sdd');
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = () => {
      order.push('settled');
      resolve();
    };
  });
  const control = { runId: 'run', stop: () => order.push('stop'), settled };
  const handlers = createSddHandlers({
    wpaths: {
      projectSpecs: 'specs',
      projectTaskGraphs: 'graphs',
      projectSddSession: 'session.json',
      projectSddBoards: 'boards',
    },
    projectRoot: '/proj',
    sddRunRegistry: { getActive: () => control },
  });

  const destroying = (handlers.onSddDestroy as () => Promise<unknown>)();
  const parked = async () => {
    for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
    return 'parked';
  };
  expect(await Promise.race([destroyed.promise.then(() => 'destroyed'), parked()])).toBe('parked');
  settle();
  await destroying;
  expect(order).toEqual(['stop', 'settled', 'destroy']);
});

// Same window on the TUI lifecycle path: rollback/cleanup were only refused
// while isRunning(), which is already false once a stop is requested.
it('runs TUI rollback only after a stopped SDD run settles', async () => {
  const { createRuntimeLifecycleDeps } = await import('../src/wiring/runtime-lifecycle-deps.js');
  const sdd = await import('@wrongstack/sdd');
  const apply = vi.spyOn(sdd, 'applySddLifecycle').mockImplementation(async (op) => {
    order.push(`apply:${op}`);
    return { op, ok: true };
  });
  order.length = 0;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = () => {
      order.push('settled');
      resolve();
    };
  });
  const deps = createRuntimeLifecycleDeps({
    getConfig: () => ({}),
    sddRunRegistry: { getActive: () => ({ runId: 'run', isRunning: () => false, settled }) },
    projectRoot: '/proj',
    paths: {},
  } as never) as unknown as { onSddLifecycle: (op: string) => Promise<unknown> };

  const rolling = deps.onSddLifecycle('rollback');
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
  expect(order).toEqual([]);
  settle();
  await rolling;
  expect(order).toEqual(['settled', 'apply:rollback']);
  apply.mockRestore();
});
