import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkpointPlugin = (await import('../src/checkpoint')).default;

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
  registerHook: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: { extensions?: Record<string, unknown> } = {}): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
}

function getTool(
  api: MockApi,
  name: string,
): { execute: (input: unknown) => Promise<Record<string, unknown>> } {
  const call = api.tools.register.mock.calls.find(
    ([t]: unknown[]) => (t as { name: string }).name === name,
  );
  if (!call) throw new Error(`${name} not registered`);
  return call[0] as { execute: (input: unknown) => Promise<Record<string, unknown>> };
}

function getHook(api: MockApi): (input: unknown) => Promise<unknown> {
  const call = api.registerHook.mock.calls[0];
  if (!call) throw new Error('hook not registered');
  return (call as unknown[])[2] as (input: unknown) => Promise<unknown>;
}

let tmp: string;
let originalCwd: string;

beforeEach(() => {
  vi.clearAllMocks();
  originalCwd = process.cwd();
  tmp = mkdtempSync(join(tmpdir(), 'checkpoint-'));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(originalCwd);
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best-effort on Windows
  }
});

describe('checkpoint plugin', () => {
  it('registers create/list/restore tools and a PreToolUse write|edit hook', () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const names = api.tools.register.mock.calls.map(
      ([t]: unknown[]) => (t as { name: string }).name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['checkpoint_create', 'checkpoint_list', 'checkpoint_restore']),
    );
    const [event, matcher] = api.registerHook.mock.calls[0]!;
    expect(event).toBe('PreToolUse');
    expect(matcher).toBe('write|edit');
  });

  it('auto-captures file content before a write and restores it', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const hook = getHook(api);

    const file = join(tmp, 'a.txt');
    writeFileSync(file, 'original');
    // Simulate the agent about to overwrite the file.
    await hook({ toolName: 'write', toolInput: { path: file } });
    writeFileSync(file, 'clobbered');

    const list = await getTool(api, 'checkpoint_list').execute({});
    const snapshots = list['snapshots'] as Array<{ id: string; origin: string }>;
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.origin).toBe('auto:write');

    const restore = await getTool(api, 'checkpoint_restore').execute({ id: snapshots[0]!.id });
    expect(restore['ok']).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('original');
  });

  it('clears snapshots when a session ends', async () => {
    // Snapshots are "in-session" by this plugin's own contract, but it is set
    // up once per PROCESS and the host outlives any one session (the WebUI
    // opens additional sessions in the same process). Nothing cleared the
    // ring, so a snapshot captured in one session stayed restorable in the
    // next — and checkpoint_restore defaults to the NEWEST snapshot, which
    // could write another session's captured content over a live file.
    const api = {
      ...makeApi(),
      onEvent: vi.fn((_event: string, _handler: () => void) => vi.fn()),
    };
    checkpointPlugin.setup(api as never);
    const hook = getHook(api as never);

    const file = join(tmp, 'session-a.txt');
    writeFileSync(file, 'session-a content');
    await hook({ toolName: 'write', toolInput: { path: file } });
    const before = await getTool(api as never, 'checkpoint_list').execute({});
    expect((before['snapshots'] as unknown[]).length).toBe(1);

    const sessionEnded = api.onEvent.mock.calls.find(([e]: unknown[]) => e === 'session.ended');
    expect(sessionEnded).toBeDefined();
    sessionEnded![1]();

    const after = await getTool(api as never, 'checkpoint_list').execute({});
    expect((after['snapshots'] as unknown[]).length).toBe(0);
  });

  it('restore without id uses the newest snapshot', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const file = join(tmp, 'b.txt');
    writeFileSync(file, 'v1');
    await getTool(api, 'checkpoint_create').execute({ paths: [file] });
    writeFileSync(file, 'v2');
    const restore = await getTool(api, 'checkpoint_restore').execute({});
    expect(restore['ok']).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('v1');
  });

  it('records non-existent files and never deletes them on restore', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const missing = join(tmp, 'new.txt');
    await getTool(api, 'checkpoint_create').execute({ paths: [missing] });
    writeFileSync(missing, 'created later');
    const restore = await getTool(api, 'checkpoint_restore').execute({});
    expect(restore['notRestoredFileDidNotExist']).toContain(missing);
    expect(readFileSync(missing, 'utf-8')).toBe('created later');
  });

  it('skips files larger than maxFileBytes', async () => {
    const api = makeApi({ extensions: { checkpoint: { maxFileBytes: 1024 } } });
    checkpointPlugin.setup(api as never);
    const big = join(tmp, 'big.txt');
    writeFileSync(big, 'x'.repeat(4096));
    await expect(getTool(api, 'checkpoint_create').execute({ paths: [big] })).rejects.toThrow(
      /all files were skipped/,
    );
  });

  it('throws when a path cannot be read instead of recording it as missing', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const dir = join(tmp, 'a-directory');
    mkdirSync(dir);
    await expect(getTool(api, 'checkpoint_create').execute({ paths: [dir] })).rejects.toThrow(
      /could not snapshot/,
    );
    const list = await getTool(api, 'checkpoint_list').execute({});
    expect(list['total']).toBe(0);
  });

  it('checkpoint_restore throws when a file fails to restore', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    mkdirSync(join(tmp, 'sub'));
    const file = join(tmp, 'sub', 'a.txt');
    writeFileSync(file, 'original');
    await getTool(api, 'checkpoint_create').execute({ paths: [file] });
    // Replace the parent dir with a plain file so the restore write cannot succeed.
    rmSync(join(tmp, 'sub'), { recursive: true, force: true });
    writeFileSync(join(tmp, 'sub'), 'blocker');
    await expect(getTool(api, 'checkpoint_restore').execute({})).rejects.toThrow(
      /failed to restore/,
    );
  });

  it('rejects manual snapshots outside the project directory', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const outside = join(tmpdir(), `checkpoint-outside-${Date.now()}.txt`);
    writeFileSync(outside, 'outside');
    try {
      await expect(getTool(api, 'checkpoint_create').execute({ paths: [outside] })).rejects.toThrow(
        /current project directory/,
      );
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('rejects snapshots through a symlink that escaped the project (content capture)', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const outsideDir = mkdtempSync(join(tmpdir(), 'checkpoint-outside-dir-'));
    writeFileSync(join(outsideDir, 'secret.txt'), 'TOP SECRET');
    // Junction on Windows (no admin/Developer Mode needed), dir symlink on POSIX.
    if (process.platform === 'win32') {
      symlinkSync(outsideDir, join(tmp, 'out-link'), 'junction');
    } else {
      symlinkSync(outsideDir, join(tmp, 'out-link'), 'dir');
    }
    try {
      // Existing file THROUGH the link: lexically inside, real target outside.
      await expect(
        getTool(api, 'checkpoint_create').execute({ paths: ['out-link/secret.txt'] }),
      ).rejects.toThrow(/out-link\/secret\.txt/);

      // Not-yet-existing leaf under the link must be rejected the same way
      // (resolveProjectPath canonicalizes the nearest existing ancestor).
      await expect(
        getTool(api, 'checkpoint_create').execute({ paths: ['out-link/newly.txt'] }),
      ).rejects.toThrow(/out-link\/newly\.txt/);

      // Auto-capture hook must not snapshot behind the link either.
      await getHook(api)({ toolName: 'write', toolInput: { path: 'out-link/secret.txt' } });
      const list = await getTool(api, 'checkpoint_list').execute({});
      expect(list['total']).toBe(0);
    } finally {
      // recursive so a Windows junction (a directory reparse point) is
      // removed; rmSync never follows it, the link itself is unlinked.
      rmSync(join(tmp, 'out-link'), { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('auto-capture ignores paths outside the project directory', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const hook = getHook(api);
    const outside = join(tmpdir(), `checkpoint-outside-${Date.now()}.txt`);
    writeFileSync(outside, 'outside');
    try {
      hook({ toolName: 'write', toolInput: { path: outside } });
      const list = await getTool(api, 'checkpoint_list').execute({});
      expect(list['total']).toBe(0);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('ring drops oldest snapshots beyond maxSnapshots', async () => {
    const api = makeApi({ extensions: { checkpoint: { maxSnapshots: 2 } } });
    checkpointPlugin.setup(api as never);
    const file = join(tmp, 'c.txt');
    writeFileSync(file, 'v');
    const create = getTool(api, 'checkpoint_create');
    await create.execute({ paths: [file], label: 'one' });
    await create.execute({ paths: [file], label: 'two' });
    await create.execute({ paths: [file], label: 'three' });
    const list = await getTool(api, 'checkpoint_list').execute({});
    expect(list['total']).toBe(2);
    const snapshots = list['snapshots'] as Array<{ origin: string }>;
    expect(snapshots.map((s) => s.origin)).toEqual(['manual:three', 'manual:two']);
  });

  it('autoCapture:false skips the hook registration', () => {
    const api = makeApi({ extensions: { checkpoint: { autoCapture: false } } });
    checkpointPlugin.setup(api as never);
    expect(api.registerHook).not.toHaveBeenCalled();
  });

  it('enabled:false rejects tool calls', async () => {
    const api = makeApi({ extensions: { checkpoint: { enabled: false } } });
    checkpointPlugin.setup(api as never);
    expect(api.registerHook).not.toHaveBeenCalled();
    await expect(getTool(api, 'checkpoint_create').execute({ paths: ['x'] })).rejects.toThrow(
      /disabled/,
    );
  });

  it('teardown drops snapshots and logs', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const file = join(tmp, 'd.txt');
    writeFileSync(file, 'v');
    await getTool(api, 'checkpoint_create').execute({ paths: [file] });
    checkpointPlugin.teardown!(api as never);
    const health = (await checkpointPlugin.health!()) as { counters: Record<string, number> };
    expect(health.counters['snapshotsHeld']).toBe(0);
    expect(api.log.info).toHaveBeenCalledWith('checkpoint: teardown complete', expect.any(Object));
  });
});

// Regression (bug-hunt r2): captureFileForHook recorded ANY error (EACCES,
// EISDIR, EBUSY...) as content:null = "did not exist at capture time", so an
// existing-but-unreadable target produced a false checkpoint_list
// existed:false / checkpoint_restore notRestoredFileDidNotExist record — the
// exact failure captureFile's invariant comment warns against ("restore would
// then silently skip the file"). Non-ENOENT capture errors now propagate
// (contained by the hook's registered failurePolicy:'open'); only a genuine
// ENOENT may be recorded as absent.
describe('auto-capture: capture errors must not record a false absence', () => {
  it('does not record an existing-but-unreadable target (directory) as absent', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const hook = getHook(api);
    const dir = join(tmp, 'sub');
    mkdirSync(dir);
    await expect(hook({ toolName: 'write', toolInput: { path: dir } })).rejects.toThrow();
    const list = await getTool(api, 'checkpoint_list').execute({});
    const snapshots = list['snapshots'] as Array<{
      files: Array<{ path: string; existed: boolean }>;
    }>;
    const falseAbsence = snapshots
      .flatMap((s) => s.files)
      .find((f) => f.path === dir && f.existed === false);
    expect(falseAbsence).toBeUndefined();
  });

  it('control: a real file still captures as existed: true', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const hook = getHook(api);
    const file = join(tmp, 'a.txt');
    writeFileSync(file, 'original');
    await hook({ toolName: 'write', toolInput: { path: file } });
    const list = await getTool(api, 'checkpoint_list').execute({});
    const snapshots = list['snapshots'] as Array<{
      files: Array<{ path: string; existed: boolean }>;
    }>;
    expect(snapshots.flatMap((s) => s.files).find((f) => f.path === file)).toMatchObject({
      existed: true,
    });
  });

  it('control: a genuinely missing path still classifies as existed: false', async () => {
    const api = makeApi();
    checkpointPlugin.setup(api as never);
    const hook = getHook(api);
    const missing = join(tmp, 'not-created-yet.txt');
    await hook({ toolName: 'write', toolInput: { path: missing } });
    const list = await getTool(api, 'checkpoint_list').execute({});
    const snapshots = list['snapshots'] as Array<{
      files: Array<{ path: string; existed: boolean }>;
    }>;
    expect(snapshots.flatMap((s) => s.files).find((f) => f.path === missing)).toMatchObject({
      existed: false,
    });
  });
});
