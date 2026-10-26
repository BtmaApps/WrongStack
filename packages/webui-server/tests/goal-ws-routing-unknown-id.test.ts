import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventBus } from '@wrongstack/contracts/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import { GoalWebSocketHandler } from '../src/server/goal-ws-handler.js';

let dir: string;

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

// A lookup of an unknown Goal id registered a graph-less per-Goal handler and
// then threw "Goal not found" without removing it. Graph-less entries count as
// live in the concurrency guard, so eight stale lookups blocked every new Goal.
it('does not keep a Goal registered after a lookup of an unknown id', async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'goal-unknown-id-'));
  const ws = { readyState: 1, on: vi.fn(), off: vi.fn(), send: vi.fn() } as never;
  const handler = new GoalWebSocketHandler(
    {} as never,
    { cwd: dir, session: { id: 'web' } } as never,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    path.join(dir, 'phases'),
    new EventBus(),
    dir,
    undefined,
    (async () => ({ agent: { run: async () => ({ status: 'done' }) } })) as never,
  );
  handler.addClient(ws);
  try {
    for (let i = 0; i < 8; i++) {
      await expect(
        handler.handleMessage(ws, { type: 'goal.status', payload: { goalId: `gone-${i}` } }),
      ).rejects.toThrow(`Goal not found: gone-${i}`);
    }
    expect((handler as never as { goals: Map<string, unknown> }).goals.size).toBe(0);
    await expect(
      handler.handleMessage(ws, { type: 'goal.start', payload: { goalId: 'fresh' } }),
    ).resolves.toBeUndefined();
  } finally {
    handler.dispose();
  }
});
