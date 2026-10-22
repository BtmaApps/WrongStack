import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPTaskJournal, MCP_TASK_LEASE_MS } from '../src/task-journal.js';

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const base = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(base, 'wrongstack-task-store-'));
  if (path.dirname(root) !== base || !path.basename(root).startsWith('wrongstack-task-store-'))
    throw new Error('Unsafe fixture path');
  dirs.push(root);
  const directory = path.join(root, 'journal');
  return {
    root,
    directory,
    file: path.join(directory, 'journal.json'),
    journal: new MCPTaskJournal(directory),
  };
}
const owner = { sessionId: 'owner', agentId: 'leader' };
const binding = 'a'.repeat(64);
const task = {
  taskId: 'task',
  status: 'working' as const,
  createdAt: '2026-10-22T12:00:00Z',
  lastUpdatedAt: '2026-10-22T12:00:00Z',
  ttlMs: null,
};

describe('durable MCP task journal', () => {
  it('evicts collected receipts with expired leases when the journal reaches capacity', async () => {
    const f = await fixture();
    await f.journal.create(owner, 'server', 'build', binding, task, randomUUID());
    const parsed = JSON.parse(await fs.readFile(f.file, 'utf8'));
    const seed = parsed.entries[0];
    parsed.entries = Array.from({ length: 256 }, (_, i) => ({
      ...seed,
      id: randomUUID(),
      taskId: `old-${i}`,
      delivered: i === 0,
      updatedAt: i + 1,
      lease: { token: randomUUID(), until: 0 },
    }));
    await fs.writeFile(f.file, JSON.stringify(parsed));
    await f.journal.create(
      owner,
      'server',
      'build',
      binding,
      { ...task, taskId: 'new-task' },
      randomUUID(),
    );
    const records = await f.journal.list(owner);
    expect(records).toHaveLength(256);
    expect(records.some((r) => r.taskId === 'old-0')).toBe(false);
    expect(records.some((r) => r.taskId === 'new-task')).toBe(true);
  });

  it('stores only receipt metadata and isolates session, agent and account ownership', async () => {
    const f = await fixture(),
      token = randomUUID();
    const receipt = await f.journal.create(
      owner,
      'server',
      'build',
      binding,
      {
        ...task,
        statusMessage: 'SECRET-STATUS',
        inputRequests: { secret: 'SECRET-FORM' },
        result: { content: 'SECRET-RESULT' },
      },
      token,
    );
    await f.journal.release(receipt.id, token);
    const raw = await fs.readFile(f.file, 'utf8');
    expect(raw).not.toContain('SECRET-');
    expect(await f.journal.list({ ...owner, sessionId: 'other' })).toEqual([]);
    expect(await f.journal.list({ ...owner, agentId: 'other' })).toEqual([]);
    expect(await f.journal.claim(receipt.id, owner, 'b'.repeat(64), randomUUID())).toBeUndefined();
    const records = await f.journal.list(owner);
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty('lease');
  });

  it('allows one observer, reclaims an expired lease and refuses a stale writer or release', async () => {
    const f = await fixture(),
      first = randomUUID(),
      second = randomUUID();
    const receipt = await f.journal.create(owner, 'server', 'build', binding, task, first);
    const other = new MCPTaskJournal(f.directory);
    expect(await other.claim(receipt.id, owner, binding, second)).toBeUndefined();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + MCP_TASK_LEASE_MS + 1);
    expect(await other.claim(receipt.id, owner, binding, second)).toBeDefined();
    await expect(f.journal.update(receipt.id, first, { delivered: true })).rejects.toThrow(
      'lease lost',
    );
    await f.journal.release(receipt.id, first);
    expect(await f.journal.claim(receipt.id, owner, binding, randomUUID())).toBeUndefined();
    await other.release(receipt.id, second);
  });

  it('serializes different writers without losing receipts', async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        new MCPTaskJournal(f.directory).create(
          owner,
          'server',
          'build',
          binding,
          { ...task, taskId: `task-${i}` },
          randomUUID(),
        ),
      ),
    );
    expect(await f.journal.list(owner)).toHaveLength(8);
  });

  it.each(['{broken', JSON.stringify({ version: 999, entries: [] })])(
    'refuses to overwrite an invalid journal',
    async (raw) => {
      const f = await fixture();
      await fs.mkdir(f.directory);
      await fs.writeFile(f.file, raw);
      await expect(
        f.journal.create(owner, 'server', 'build', binding, task, randomUUID()),
      ).rejects.toThrow();
      expect(await fs.readFile(f.file, 'utf8')).toBe(raw);
    },
  );

  it('refuses a linked journal directory', async () => {
    const f = await fixture();
    const target = path.join(f.root, 'elsewhere');
    await fs.mkdir(target);
    await fs.symlink(target, f.directory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(f.journal.list(owner)).rejects.toThrow('Unsafe MCP task journal directory');
    expect(await fs.readdir(target)).toEqual([]);
  });

  it('lets only one of two real processes claim the same durable receipt', async () => {
    const f = await fixture(),
      token = randomUUID();
    const receipt = await f.journal.create(owner, 'server', 'build', binding, task, token);
    await f.journal.release(receipt.id, token);
    const script = path.join(f.root, 'claim.mjs');
    const moduleUrl = new URL('../src/task-journal.ts', import.meta.url).href;
    await fs.writeFile(
      script,
      `import {MCPTaskJournal} from ${JSON.stringify(moduleUrl)};import {randomUUID} from 'node:crypto';const result=await new MCPTaskJournal(process.argv[2]).claim(process.argv[3],{sessionId:'owner',agentId:'leader'},'a'.repeat(64),randomUUID());console.log(JSON.stringify({claimed:!!result}));`,
    );
    const results = await Promise.all(
      [0, 1].map(() =>
        promisify(execFile)(process.execPath, [script, f.directory, receipt.id], {
          timeout: 10_000,
        }),
      ),
    );
    expect(results.map((r) => JSON.parse(r.stdout).claimed).sort()).toEqual([false, true]);
  });
});
