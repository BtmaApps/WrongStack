import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { MCPTaskJournal } from '../src/task-journal.js';
import { MCPTaskRecovery } from '../src/task-recovery.js';
import type { MCPTaskContext } from '../src/task-identity.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
const owner = { sessionId: 'tab-a', agentId: 'leader' };
const context = { session: { id: owner.sessionId }, agentId: owner.agentId } as MCPTaskContext;
const task = {
  taskId: 'remote',
  status: 'working' as const,
  createdAt: '2026-10-22T00:00:00Z',
  lastUpdatedAt: '2026-10-22T00:00:00Z',
  ttlMs: null,
};
async function fixture() {
  const base = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'wrongstack-task-watch-'));
  if (
    path.dirname(directory) !== base ||
    !path.basename(directory).startsWith('wrongstack-task-watch-')
  )
    throw new Error('Unsafe fixture');
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  const withClient = vi.fn(),
    closed = vi.fn();
  const recovery = new MCPTaskRecovery(directory, {
    withClient,
    log: { info() {}, warn() {}, error() {}, debug() {} },
  } as never);
  cleanup.push(() => recovery.dispose());
  return { directory, recovery, withClient, closed };
}
it('observes atomic writes from a separate process without replaying a tool or leaking another owner', async () => {
  const f = await fixture();
  const snapshots: unknown[][] = [];
  const jobs: Promise<void>[] = [];
  const off = await f.recovery.subscribe(
    context,
    () => {
      jobs.push(
        f.recovery.list(context).then((rows) => {
          snapshots.push(rows);
        }),
      );
    },
    f.closed,
  );
  const source = `import {MCPTaskJournal} from ${JSON.stringify(new URL('../src/task-journal.ts', import.meta.url).href)};
    import {randomUUID} from 'node:crypto';
    const journal = new MCPTaskJournal(process.argv[1]);
    for (const sessionId of ['tab-a','tab-b']) await journal.create({sessionId,agentId:'leader'},'build','compile','a'.repeat(64),{...${JSON.stringify(task)},taskId:sessionId},randomUUID());`;
  await promisify(execFile)(process.execPath, ['-e', source, f.directory], { timeout: 10_000 });
  await vi.waitFor(() => expect(snapshots.at(-1)).toHaveLength(1), { timeout: 5000 });
  expect(snapshots.at(-1)).toMatchObject([{ sessionId: 'tab-a', taskId: 'tab-a' }]);
  expect(f.withClient).not.toHaveBeenCalled();
  off();
  await Promise.all(jobs);
  await f.recovery.dispose();
  expect(f.closed).not.toHaveBeenCalled();
});
it('notifies after a committed mutation and observes collected results and lease release', async () => {
  const f = await fixture(),
    token = randomUUID();
  const changed = vi.fn();
  await f.recovery.subscribe(context, changed, f.closed);
  const journal = new MCPTaskJournal(f.directory, () => {
    throw new Error('Observer cannot break writes');
  });
  const receipt = await journal.create(owner, 'build', 'compile', 'a'.repeat(64), task, token);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await f.recovery.list(context)).toMatchObject([{ id: receipt.id, status: 'working' }]);
  changed.mockClear();
  await journal.update(receipt.id, token, {
    task: { ...task, status: 'completed' },
    delivered: true,
  });
  await journal.release(receipt.id, token);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const rows = await f.recovery.list(context);
  expect(rows).toMatchObject([{ status: 'completed', delivered: true }]);
  expect(rows[0]).not.toHaveProperty('leaseExpiresAt');
  await f.recovery.dispose();
  expect(f.closed).toHaveBeenCalledTimes(1);
  await expect(f.recovery.subscribe(context, changed, f.closed)).rejects.toThrow('unavailable');
});
it('rejects a context that changes ownership while attaching the observer', async () => {
  const f = await fixture();
  let reads = 0;
  const moving = { ...context, eventSessionId: () => (++reads === 1 ? 'tab-a' : 'tab-b') };
  await expect(f.recovery.subscribe(moving, vi.fn(), f.closed)).rejects.toThrow('owner changed');
});
