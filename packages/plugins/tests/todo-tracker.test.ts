import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '@wrongstack/core';
import todoTrackerPlugin, { createTodoTrackerPlugin, deriveProjectSlug } from '../src/todo-tracker';

function corruptSiblings(): string[] {
  return readdirSync(tmpDir).filter((f) => f.startsWith('todo-tracker.json.corrupt-'));
}

interface MockApi {
  tools: { register: ReturnType<typeof vi.fn> };
  config: { extensions: Record<string, unknown> };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  metrics: {
    counter: ReturnType<typeof vi.fn>;
    histogram: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  };
  registerSystemPromptContributor: ReturnType<typeof vi.fn>;
  registerHook: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  session: { append: ReturnType<typeof vi.fn> };
}

function makeApi(filePath: string): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: { 'todo-tracker': { filePath } } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerSystemPromptContributor: vi.fn(() => () => {}),
    registerHook: vi.fn(() => vi.fn()),
    onEvent: vi.fn(),
    session: { append: vi.fn().mockResolvedValue(undefined) },
  };
}

function makeUnconfiguredApi(): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerSystemPromptContributor: vi.fn(() => () => {}),
    registerHook: vi.fn(() => vi.fn()),
    onEvent: vi.fn(),
    session: { append: vi.fn().mockResolvedValue(undefined) },
  };
}

function getTool(
  api: MockApi,
  name: string,
): {
  permission: 'auto' | 'confirm';
  execute: (input: unknown) => Promise<unknown>;
} {
  // Latest registration wins, like a real registry after a reload.
  const call = api.tools.register.mock.calls.findLast(
    ([t]: unknown[]) => (t as { name: string }).name === name,
  );
  if (!call) throw new Error(`tool ${name} not registered`);
  return call[0] as {
    permission: 'auto' | 'confirm';
    execute: (input: unknown) => Promise<unknown>;
  };
}

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = mkdtempSync(join(tmpdir(), 'todo-tracker-test-'));
  filePath = join(tmpDir, 'todo-tracker.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('todo-tracker plugin', () => {
  it('registers all 7 tools on setup', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const names = api.tools.register.mock.calls.map(
      ([t]: unknown[]) => (t as { name: string }).name,
    );
    expect(names).toContain('todo_tracker_list');
    expect(names).toContain('todo_tracker_add');
    expect(names).toContain('todo_tracker_complete');
    expect(names).toContain('todo_tracker_drop');
    expect(names).toContain('todo_tracker_remove');
    expect(names).toContain('todo_tracker_pull');
    expect(names).toContain('todo_tracker_status');
  });

  it('requires confirmation only for permanent removal', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);

    expect(getTool(api, 'todo_tracker_remove').permission).toBe('confirm');
    expect(getTool(api, 'todo_tracker_drop').permission).toBe('auto');
  });

  it('warns and no-ops when no file path is configured', async () => {
    const api = makeUnconfiguredApi();
    await todoTrackerPlugin.setup(api as never);
    expect(api.log.warn).toHaveBeenCalledWith(expect.stringContaining('no file path configured'));
    // When no file path is configured the plugin short-circuits:
    // no tools are registered, no file is touched. The host surfaces
    // the warning in its own log; calling setupPlugins with a
    // project that lacks paths.projectDir is a host-level misconfig.
    expect(api.tools.register).not.toHaveBeenCalled();
  });
});

describe('add + list round trip', () => {
  it('persists across setup() calls (the cross-session use case)', async () => {
    // Session 1: add an item
    const api1 = makeApi(filePath);
    await todoTrackerPlugin.setup(api1 as never);
    const addTool = getTool(api1, 'todo_tracker_add');
    const added = (await addTool.execute({ content: 'fix flaky test' })) as {
      ok: boolean;
      item: { id: string; content: string; status: string };
    };
    expect(added.ok).toBe(true);
    expect(added.item.content).toBe('fix flaky test');
    expect(added.item.status).toBe('pending');
    todoTrackerPlugin.teardown!(api1 as never);

    // Session 2: re-setup and verify the item is still there
    const api2 = makeApi(filePath);
    await todoTrackerPlugin.setup(api2 as never);
    const listTool = getTool(api2, 'todo_tracker_list');
    const listed = (await listTool.execute({})) as {
      ok: boolean;
      total: number;
      items: Array<{ id: string; content: string }>;
    };
    expect(listed.ok).toBe(true);
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.content).toBe('fix flaky test');
  });

  it('rejects empty content with a clear error', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    await expect(addTool.execute({ content: '   ' })).rejects.toThrow(/content is required/);
  });

  it('list filters by status, priority, and tag', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    await addTool.execute({ content: 'low prio bug', priority: 'low', tags: ['bug'] });
    await addTool.execute({ content: 'high prio bug', priority: 'high', tags: ['bug'] });
    await addTool.execute({ content: 'unrelated task', tags: ['chore'] });

    const listAll = (await getTool(api, 'todo_tracker_list').execute({ status: 'all' })) as {
      total: number;
    };
    expect(listAll.total).toBe(3);

    const listBugs = (await getTool(api, 'todo_tracker_list').execute({
      status: 'all',
      tag: 'bug',
    })) as { total: number; items: Array<{ content: string; priority: string }> };
    expect(listBugs.total).toBe(2);
    for (const it of listBugs.items) expect(it.priority).not.toBe('normal');

    const listHigh = (await getTool(api, 'todo_tracker_list').execute({
      status: 'all',
      priority: 'high',
    })) as { total: number; items: Array<{ content: string }> };
    expect(listHigh.total).toBe(1);
    expect(listHigh.items[0]?.content).toBe('high prio bug');
  });

  it('list defaults to active items (pending + in_progress) only', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    const completeTool = getTool(api, 'todo_tracker_complete');
    const a = (await addTool.execute({ content: 'pending one' })) as { item: { id: string } };
    const b = (await addTool.execute({ content: 'completed one' })) as { item: { id: string } };
    await completeTool.execute({ id: b.item.id });

    const listed = (await getTool(api, 'todo_tracker_list').execute({})) as {
      total: number;
      items: Array<{ id: string }>;
    };
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.id).toBe(a.item.id);
  });
});

describe('complete / drop / remove', () => {
  it('complete is idempotent', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    const completeTool = getTool(api, 'todo_tracker_complete');
    const added = (await addTool.execute({ content: 'do thing' })) as { item: { id: string } };

    const first = (await completeTool.execute({ id: added.item.id })) as {
      ok: boolean;
      message?: string;
    };
    expect(first.ok).toBe(true);
    expect(first.message).toBeUndefined();

    const second = (await completeTool.execute({ id: added.item.id })) as {
      ok: boolean;
      message?: string;
    };
    expect(second.ok).toBe(true);
    expect(second.message).toMatch(/already completed/);
  });

  it('drop marks an item dropped (kept in store for audit)', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    const dropTool = getTool(api, 'todo_tracker_drop');
    const added = (await addTool.execute({ content: 'obsolete thing' })) as {
      item: { id: string };
    };

    await dropTool.execute({ id: added.item.id });
    const status = (await getTool(api, 'todo_tracker_status').execute({})) as {
      counters: Record<string, number>;
      total: number;
    };
    // The item is still in the file (audit) but counted as dropped.
    expect(status.total).toBe(1);
    expect(status.counters['dropped']).toBe(1);
  });

  it('remove permanently deletes the item from disk', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    const removeTool = getTool(api, 'todo_tracker_remove');
    const added = (await addTool.execute({ content: 'gone tomorrow' })) as { item: { id: string } };

    const result = (await removeTool.execute({ id: added.item.id })) as {
      ok: boolean;
      removed: { id: string };
    };
    expect(result.ok).toBe(true);
    expect(result.removed.id).toBe(added.item.id);

    // Verify on-disk too
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as { items: unknown[] };
    expect(onDisk.items).toHaveLength(0);
  });

  it('returns a clear error for an unknown id', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    for (const name of ['todo_tracker_complete', 'todo_tracker_drop', 'todo_tracker_remove']) {
      await expect(getTool(api, name).execute({ id: 'no-such-id' })).rejects.toThrow(
        /no item with id/,
      );
      await expect(getTool(api, name).execute({})).rejects.toThrow(/id is required/);
    }
  });
});

describe('pull', () => {
  it('returns only pending + in_progress items', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    const completeTool = getTool(api, 'todo_tracker_complete');
    const a = (await addTool.execute({ content: 'open work' })) as { item: { id: string } };
    await addTool.execute({ content: 'another open' });
    const c = (await addTool.execute({ content: 'closed' })) as { item: { id: string } };
    await completeTool.execute({ id: c.item.id });

    const pulled = (await getTool(api, 'todo_tracker_pull').execute({})) as {
      ok: boolean;
      total: number;
      items: Array<{ id: string; content: string }>;
    };
    expect(pulled.ok).toBe(true);
    expect(pulled.total).toBe(2);
    const ids = pulled.items.map((i) => i.id);
    expect(ids).toContain(a.item.id);
    expect(ids).not.toContain(c.item.id);
  });
});

describe('file persistence (atomic write + corruption tolerance)', () => {
  it('creates a file on first save and reads it back on next setup', async () => {
    const api1 = makeApi(filePath);
    await todoTrackerPlugin.setup(api1 as never);
    const addTool = getTool(api1, 'todo_tracker_add');
    await addTool.execute({ content: 'persisted item' });
    todoTrackerPlugin.teardown!(api1 as never);

    // Read the file directly and confirm shape
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      version: number;
      items: Array<{ content: string }>;
    };
    expect(onDisk.version).toBe(1);
    expect(onDisk.items).toHaveLength(1);
    expect(onDisk.items[0]?.content).toBe('persisted item');

    // Re-setup and confirm we can read it
    const api2 = makeApi(filePath);
    await todoTrackerPlugin.setup(api2 as never);
    const listed = (await getTool(api2, 'todo_tracker_list').execute({})) as { total: number };
    expect(listed.total).toBe(1);
  });

  it('quarantines a corrupt file instead of erasing it on the next write', async () => {
    const corruptBytes = 'not valid json {{{';
    writeFileSync(filePath, corruptBytes);

    const api = makeApi(filePath);
    await expect(todoTrackerPlugin.setup(api as never)).resolves.not.toThrow();
    const listed = (await getTool(api, 'todo_tracker_list').execute({})) as { total: number };
    expect(listed.total).toBe(0);

    await getTool(api, 'todo_tracker_add').execute({ content: 'after corruption' });

    const quarantined = corruptSiblings();
    expect(quarantined).toHaveLength(1);
    expect(readFileSync(join(tmpDir, quarantined[0]!), 'utf8')).toBe(corruptBytes);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      items: Array<{ content: string }>;
    };
    expect(onDisk.items.map((i) => i.content)).toEqual(['after corruption']);

    expect(api.log.error).toHaveBeenCalledWith(
      expect.stringContaining(quarantined[0]!),
      expect.anything(),
    );
    const h = (await todoTrackerPlugin.health!()) as { ok: boolean; message: string };
    expect(h.ok).toBe(false);
    expect(h.message).toContain('.corrupt-');
  });

  it('quarantines a file whose items have invalid fields (no TypeError in list)', async () => {
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        projectSlug: 'x',
        updatedAt: 'now',
        items: [{ id: 'a', content: 'c', status: 5, priority: 'normal', tags: [] }],
      }),
    );
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const listed = (await getTool(api, 'todo_tracker_list').execute({ status: 'pending' })) as {
      total: number;
    };
    expect(listed.total).toBe(0);
    expect(corruptSiblings()).toHaveLength(1);
    expect(((await todoTrackerPlugin.health!()) as { ok: boolean }).ok).toBe(false);
  });

  it('loads a file with a UTF-8 BOM normally', async () => {
    const api1 = makeApi(filePath);
    await todoTrackerPlugin.setup(api1 as never);
    await getTool(api1, 'todo_tracker_add').execute({ content: 'bom item' });
    todoTrackerPlugin.teardown!(api1 as never);
    writeFileSync(filePath, `\uFEFF${readFileSync(filePath, 'utf8')}`);

    const api2 = makeApi(filePath);
    await todoTrackerPlugin.setup(api2 as never);
    const listed = (await getTool(api2, 'todo_tracker_list').execute({})) as {
      total: number;
      items: Array<{ content: string }>;
    };
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.content).toBe('bom item');
    expect(corruptSiblings()).toHaveLength(0);
  });

  it('never writes a file with an unsupported (newer) version', async () => {
    const v2 = JSON.stringify({ version: 2, items: [{ anything: true }] });
    writeFileSync(filePath, v2);
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);

    await expect(getTool(api, 'todo_tracker_add').execute({ content: 'nope' })).rejects.toThrow(
      /read-only.*version 2/,
    );
    expect(readFileSync(filePath, 'utf8')).toBe(v2);
    expect(corruptSiblings()).toHaveLength(0);
    expect(((await todoTrackerPlugin.health!()) as { ok: boolean }).ok).toBe(false);
  });

  it('accepts files that stored the legacy slug (basename with extension)', async () => {
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        projectSlug: 'todo-tracker.json',
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            id: 'legacy-1',
            content: 'old item',
            status: 'pending',
            priority: 'normal',
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            completedAt: null,
            sourceSessionId: null,
            notes: null,
          },
        ],
      }),
    );
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const status = (await getTool(api, 'todo_tracker_status').execute({})) as {
      total: number;
      projectSlug: string;
    };
    expect(status.total).toBe(1);
    expect(status.projectSlug).toBe('todo-tracker');
  });
});

describe('concurrency + multi-host isolation', () => {
  it('sees and preserves items written by another process', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    await getTool(api, 'todo_tracker_add').execute({ content: 'mine' });

    // Simulate a second process appending to the same file.
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as { items: Array<unknown> };
    const foreign = {
      ...(onDisk.items[0] as Record<string, unknown>),
      id: 'foreign-1',
      content: 'theirs',
    };
    onDisk.items.push(foreign);
    writeFileSync(filePath, JSON.stringify(onDisk));

    const listed = (await getTool(api, 'todo_tracker_list').execute({})) as { total: number };
    expect(listed.total).toBe(2);
    await getTool(api, 'todo_tracker_add').execute({ content: 'mine again' });
    const after = JSON.parse(readFileSync(filePath, 'utf8')) as {
      items: Array<{ content: string }>;
    };
    expect(after.items.map((i) => i.content).sort()).toEqual(['mine', 'mine again', 'theirs']);
  });

  it('two independent plugin instances on one file keep both writes', async () => {
    const pluginA = createTodoTrackerPlugin();
    const pluginB = createTodoTrackerPlugin();
    const apiA = makeApi(filePath);
    const apiB = makeApi(filePath);
    await pluginA.setup(apiA as never);
    await pluginB.setup(apiB as never);

    await getTool(apiA, 'todo_tracker_add').execute({ content: 'from A' });
    await getTool(apiB, 'todo_tracker_add').execute({ content: 'from B' });

    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      items: Array<{ content: string }>;
    };
    expect(onDisk.items.map((i) => i.content).sort()).toEqual(['from A', 'from B']);
    for (const api of [apiA, apiB]) {
      const listed = (await getTool(api, 'todo_tracker_list').execute({})) as { total: number };
      expect(listed.total).toBe(2);
    }
  });

  it('20 parallel adds across two instances all land on disk', async () => {
    const pluginA = createTodoTrackerPlugin();
    const pluginB = createTodoTrackerPlugin();
    const apiA = makeApi(filePath);
    const apiB = makeApi(filePath);
    await pluginA.setup(apiA as never);
    await pluginB.setup(apiB as never);
    const addA = getTool(apiA, 'todo_tracker_add');
    const addB = getTool(apiB, 'todo_tracker_add');

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 === 0 ? addA : addB).execute({ content: `item ${i}` }),
      ),
    );
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as { items: unknown[] };
    expect(onDisk.items).toHaveLength(20);
  }, 30_000);

  it('two hosts in one process do not clobber each other’s file path', async () => {
    const otherFile = join(tmpDir, 'other.json');
    const api1 = makeApi(filePath);
    const api2 = makeApi(otherFile);
    await todoTrackerPlugin.setup(api1 as never);
    await todoTrackerPlugin.setup(api2 as never);

    await getTool(api1, 'todo_tracker_add').execute({ content: 'for file 1' });
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as {
      items: Array<{ content: string }>;
    };
    expect(onDisk.items.map((i) => i.content)).toEqual(['for file 1']);
    expect(existsSync(otherFile)).toBe(false);
    todoTrackerPlugin.teardown!(api1 as never);
    todoTrackerPlugin.teardown!(api2 as never);
  });
});

describe('small fixes', () => {
  it('projectSlug is the basename without extension', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const status = (await getTool(api, 'todo_tracker_status').execute({})) as {
      projectSlug: string;
    };
    expect(status.projectSlug).toBe('todo-tracker');
    expect(deriveProjectSlug('/p/.todos')).toBe('.todos');
    expect(deriveProjectSlug('C:\\p\\backlog.v1.json')).toBe('backlog.v1');
  });

  it('pull reports total before the limit and is not a mutation', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    for (const c of ['a', 'b', 'c']) {
      await getTool(api, 'todo_tracker_add').execute({ content: c });
    }
    const pulled = (await getTool(api, 'todo_tracker_pull').execute({ limit: 1 })) as {
      total: number;
      items: unknown[];
    };
    expect(pulled.total).toBe(3);
    expect(pulled.items).toHaveLength(1);
    const status = (await getTool(api, 'todo_tracker_status').execute({})) as {
      lastMutation: { op: string };
      session: { pull: number };
    };
    expect(status.lastMutation.op).toBe('add');
    expect(status.session.pull).toBe(1);
  });

  it('logs when session.append fails in add', async () => {
    const api = makeApi(filePath);
    api.session.append.mockRejectedValue(new Error('writer closed'));
    await todoTrackerPlugin.setup(api as never);
    const res = (await getTool(api, 'todo_tracker_add').execute({ content: 'x' })) as {
      ok: boolean;
    };
    expect(res.ok).toBe(true);
    expect(api.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('session.append failed'),
      expect.anything(),
    );
  });

  it('not-found error lists known open ids', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const added = (await getTool(api, 'todo_tracker_add').execute({ content: 'real' })) as {
      item: { id: string };
    };
    await expect(
      getTool(api, 'todo_tracker_complete').execute({ id: `${added.item.id.slice(0, 8)}` }),
    ).rejects.toThrow(added.item.id);
  });
});

describe('teardown on a real ToolRegistry', () => {
  it('setup → teardown → setup does not throw and tools are gone after teardown', async () => {
    const registry = new ToolRegistry();
    const api = {
      ...makeApi(filePath),
      tools: {
        register: (t: never) => registry.register(t, 'todo-tracker'),
        unregister: (name: string) => registry.unregister(name),
        get: (name: string) => registry.get(name),
        list: () => registry.list(),
      },
    };
    await todoTrackerPlugin.setup(api as never);
    expect(registry.get('todo_tracker_add')).toBeDefined();
    await todoTrackerPlugin.teardown!(api as never);
    expect(registry.list().filter((t) => t.name.startsWith('todo_tracker_'))).toHaveLength(0);
    await expect(todoTrackerPlugin.setup(api as never)).resolves.not.toThrow();
    // Re-setup without teardown is also safe.
    await expect(todoTrackerPlugin.setup(api as never)).resolves.not.toThrow();
    expect(registry.list().filter((t) => t.name.startsWith('todo_tracker_'))).toHaveLength(7);
    await todoTrackerPlugin.teardown!(api as never);
  });
});

describe('teardown + H1 pattern', () => {
  it('teardown zeros counters and clears in-memory cache', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    const addTool = getTool(api, 'todo_tracker_add');
    await addTool.execute({ content: 'a' });
    await addTool.execute({ content: 'b' });
    expect((await todoTrackerPlugin.health!()) as { sessionCounts: { add: number } }).toMatchObject(
      {
        sessionCounts: { add: 2 },
      },
    );

    todoTrackerPlugin.teardown!(api as never);
    const h = (await todoTrackerPlugin.health!()) as {
      ok: boolean;
      message: string;
    };
    // After teardown, the plugin is "unconfigured" — filePath is null.
    expect(h.ok).toBe(false);
    expect(h.message).toContain('no file path configured');
  });

  it('teardown is safe to call before setup (defensive)', () => {
    const api = makeApi(filePath);
    expect(() => todoTrackerPlugin.teardown!(api as never)).not.toThrow();
  });

  it('reload cycle: setup → teardown → setup reads fresh counters', async () => {
    const api = makeApi(filePath);
    await todoTrackerPlugin.setup(api as never);
    await getTool(api, 'todo_tracker_add').execute({ content: 'one' });
    await getTool(api, 'todo_tracker_add').execute({ content: 'two' });

    todoTrackerPlugin.teardown!(api as never);
    // Second round: re-setup with the same file (so persisted items
    // remain on disk, but counters reset).
    await todoTrackerPlugin.setup(api as never);
    const status = (await getTool(api, 'todo_tracker_status').execute({})) as {
      total: number;
      session: { add: number };
    };
    // Two items persisted, but session counter is reset to 0
    expect(status.total).toBe(2);
    expect(status.session.add).toBe(0);
  });
});
