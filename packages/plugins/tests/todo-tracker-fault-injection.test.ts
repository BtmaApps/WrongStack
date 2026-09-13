/**
 * todo-tracker durability under injected filesystem faults.
 *
 * Faults are injected through the plugin's `createTodoTrackerPlugin(deps)`
 * seam rather than `vi.mock('@wrongstack/core/utils')`, which is flaky under
 * parallel vitest (see context-pins-extra.test.ts).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTodoTrackerPlugin } from '../src/todo-tracker';

function makeApi(filePath: string) {
  return {
    tools: { register: vi.fn(), unregister: vi.fn() },
    config: { extensions: { 'todo-tracker': { filePath } } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    session: { append: vi.fn().mockResolvedValue(undefined) },
  };
}

type Api = ReturnType<typeof makeApi>;

function tool(api: Api, name: string): { execute: (input: unknown) => Promise<unknown> } {
  const call = api.tools.register.mock.calls.find(
    ([t]: unknown[]) => (t as { name: string }).name === name,
  );
  if (!call) throw new Error(`tool ${name} not registered`);
  return call[0] as { execute: (input: unknown) => Promise<unknown> };
}

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'todo-tracker-faults-'));
  filePath = join(tmpDir, 'todo-tracker.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('todo-tracker fault injection', () => {
  it('stays read-only and leaves the original untouched when quarantine rename fails', async () => {
    const corrupt = '{"version":1,"items":[';
    writeFileSync(filePath, corrupt);
    const rename = vi.fn(async () => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    });
    const plugin = createTodoTrackerPlugin({ rename });
    const api = makeApi(filePath);
    await plugin.setup(api as never);

    expect(rename).toHaveBeenCalled();
    await expect(tool(api, 'todo_tracker_add').execute({ content: 'x' })).rejects.toThrow(
      /read-only.*todo-tracker\.json/,
    );
    expect(readFileSync(filePath, 'utf8')).toBe(corrupt);
    expect(readdirSync(tmpDir).filter((f) => f.includes('.corrupt-'))).toHaveLength(0);
    const listed = (await tool(api, 'todo_tracker_list').execute({})) as { total: number };
    expect(listed.total).toBe(0);
    const h = (await plugin.health!()) as { ok: boolean; message: string };
    expect(h.ok).toBe(false);
    expect(h.message).toContain('read-only');
  });

  it('a failed atomic write leaves memory and disk unchanged; retry adds exactly once', async () => {
    let failNext = false;
    const plugin = createTodoTrackerPlugin({
      atomicWrite: async (p, content, opts) => {
        if (failNext) {
          failNext = false;
          throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
        }
        await atomicWrite(p, content, opts);
      },
    });
    const api = makeApi(filePath);
    await plugin.setup(api as never);
    await tool(api, 'todo_tracker_add').execute({ content: 'first' });
    const before = readFileSync(filePath, 'utf8');

    failNext = true;
    await expect(tool(api, 'todo_tracker_add').execute({ content: 'second' })).rejects.toThrow(
      /ENOSPC/,
    );
    expect(readFileSync(filePath, 'utf8')).toBe(before);
    const h = (await plugin.health!()) as { total: number; sessionCounts: { add: number } };
    expect(h.total).toBe(1);
    expect(h.sessionCounts.add).toBe(1);

    await tool(api, 'todo_tracker_add').execute({ content: 'second' });
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      items: Array<{ content: string }>;
    };
    expect(onDisk.items.map((i) => i.content)).toEqual(['first', 'second']);
  });

  it('a failed write on complete does not report "already completed" afterwards', async () => {
    let failNext = false;
    const plugin = createTodoTrackerPlugin({
      atomicWrite: async (p, content, opts) => {
        if (failNext) {
          failNext = false;
          throw new Error('EIO');
        }
        await atomicWrite(p, content, opts);
      },
    });
    const api = makeApi(filePath);
    await plugin.setup(api as never);
    const added = (await tool(api, 'todo_tracker_add').execute({ content: 'x' })) as {
      item: { id: string };
    };
    failNext = true;
    await expect(tool(api, 'todo_tracker_complete').execute({ id: added.item.id })).rejects.toThrow(
      /EIO/,
    );
    const retry = (await tool(api, 'todo_tracker_complete').execute({ id: added.item.id })) as {
      message?: string;
      item: { status: string };
    };
    expect(retry.message).toBeUndefined();
    expect(retry.item.status).toBe('completed');
  });
});
