import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock async execFile before importing the plugin so the plugin's import
// of node:child_process is replaced at module-load time.
const mockExecFile = vi.fn(
  (
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (error: Error | null, stdout: string) => void,
  ) => {
    const command = args.join(' ');
    const stdout = command.includes('branch --show-current') ? 'main\n' : '';
    queueMicrotask(() => cb(null, stdout));
  },
);

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// Import AFTER the mock is set up.
const branchGuardPlugin = (await import('../src/branch-guard')).default;

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
  onConfigChange: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  emitCustom: ReturnType<typeof vi.fn>;
  session: { append: ReturnType<typeof vi.fn> };
}

function makeApi(overrides: { extensions?: Record<string, unknown> } = {}): MockApi {
  const onConfigChange = vi.fn(() => vi.fn());
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onConfigChange,
    onEvent: vi.fn(),
    emitCustom: vi.fn(),
    session: { append: vi.fn().mockResolvedValue(undefined) },
  };
}

function getHook(
  api: MockApi,
): (
  input: unknown,
) => Promise<{ decision?: string; reason?: string; additionalContext?: string } | void> {
  const call = api.registerHook.mock.calls[0];
  if (!call) throw new Error('hook not registered');
  return (call as unknown[])[2] as ReturnType<typeof getHook>;
}

function getStatusTool(api: MockApi): { execute: (input: unknown) => Promise<unknown> } {
  const call = api.tools.register.mock.calls.find(
    ([t]: unknown[]) => (t as { name: string }).name === 'branch_guard_status',
  );
  if (!call) throw new Error('branch_guard_status not registered');
  return call[0] as { execute: (input: unknown) => Promise<unknown> };
}

/** Set the mock to return a specific branch name. */
function setBranch(branch: string): void {
  mockExecFile.mockImplementation((_cmd, args, _opts, cb) => {
    const command = args.join(' ');
    const stdout = command.includes('branch --show-current') ? branch + '\n' : '';
    queueMicrotask(() => cb(null, stdout));
    return undefined as never;
  });
}

/** Set the mock to simulate a dirty working tree (uncommitted changes). */
function setDirty(dirty: boolean): void {
  const currentImpl = mockExecFile.getMockImplementation();
  mockExecFile.mockImplementation((cmd, args, opts, cb) => {
    const command = args.join(' ');
    if (command.includes('status --porcelain')) {
      queueMicrotask(() => cb(null, dirty ? ' M packages/plugins/src/test.ts\n' : ''));
      return undefined as never;
    }
    return currentImpl?.(cmd, args, opts, cb) as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setBranch('main');
});

describe('branch-guard plugin', () => {
  it('registers branch_guard_status tool and a PreToolUse hook', () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    expect(api.tools.register).toHaveBeenCalledTimes(1);
    expect(api.registerHook).toHaveBeenCalledTimes(1);
    const [event, matcher] = api.registerHook.mock.calls[0]!;
    expect(event).toBe('PreToolUse');
    expect(matcher).toBe('bash|git|git_autocommit');
  });
});

describe('hook behavior — non-git commands', () => {
  it('passes through bash commands that are not git commit/push/merge', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(await hook({ toolName: 'bash', toolInput: { command: 'ls -la' } })).toBeUndefined();
  });

  it('passes through non-bash non-git_autocommit tools', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(await hook({ toolName: 'read', toolInput: { path: '/tmp/x' } })).toBeUndefined();
  });
});

describe('hook behavior — git commit on protected branch', () => {
  it('blocks git commit on main (default protected)', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('main');
    expect(result?.reason).toContain('protected');
  });

  it.each([
    'git -C . commit -m "x"',
    'git -c user.name=bot commit -m "x"',
    'git --no-pager push origin main',
    'git --git-dir .git commit -m "x"',
  ])('sees through git global options: %s', async (command) => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const result = await getHook(api)({ toolName: 'bash', toolInput: { command } });
    expect(result?.decision).toBe('block');
  });

  it('blocks git_autocommit tool on main', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'git_autocommit', toolInput: { type: 'feat' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('commit');
    expect(result?.reason).toContain('protected');
    expect(result?.reason).toContain('retry git_autocommit');
  });

  it('allows git_autocommit dry_run on main because it does not commit', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({ toolName: 'git_autocommit', toolInput: { dry_run: true } }),
    ).toBeUndefined();
  });

  it('blocks the structured git commit tool on main', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'git', toolInput: { command: 'commit', message: 'x' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('commit');
  });

  it('allows structured git commit dry_run on main because it does not commit', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({
        toolName: 'git',
        toolInput: { command: 'commit', message: 'x', dry_run: true },
      }),
    ).toBeUndefined();
  });
});

describe('hook behavior — git push and merge', () => {
  it('blocks git push on main', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git push origin main' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('push');
  });

  it('blocks structured git push on main', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'git', toolInput: { command: 'push' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('push');
  });

  it('blocks git merge on main', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({
      toolName: 'bash',
      toolInput: { command: 'git merge feature-branch' },
    });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('merge');
  });
});

describe('hook behavior — warn mode', () => {
  it('injects additionalContext instead of blocking', async () => {
    const api = makeApi({ extensions: { 'branch-guard': { mode: 'warn' } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('allow');
    expect(result?.additionalContext).toContain('branch-guard');
    expect(result?.additionalContext).toContain('main');
  });
});

describe('hook behavior — disabled mode', () => {
  it('does not block when mode=off', async () => {
    const api = makeApi({ extensions: { 'branch-guard': { mode: 'off' } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }),
    ).toBeUndefined();
  });

  it('does not block when enabled=false', async () => {
    const api = makeApi({ extensions: { 'branch-guard': { enabled: false } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }),
    ).toBeUndefined();
  });

  it('hot-disables when config changes to a disabled plugin entry', async () => {
    let watcher: ((next: unknown, prev: unknown) => void) | undefined;
    const api = makeApi();
    api.onConfigChange.mockImplementation((cb: (next: unknown, prev: unknown) => void) => {
      watcher = cb;
      return vi.fn();
    });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      (await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }))?.decision,
    ).toBe('block');

    watcher?.({ plugins: [{ name: 'branch-guard', enabled: false }], extensions: {} }, {});

    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }),
    ).toBeUndefined();
  });
});

describe('hook behavior — custom protected branches', () => {
  it('blocks on a custom protected branch', async () => {
    setBranch('develop');
    const api = makeApi({ extensions: { 'branch-guard': { branches: ['develop'] } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('develop');
  });

  it('does not block on a non-protected branch', async () => {
    setBranch('feature-xyz');
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }),
    ).toBeUndefined();
  });
});

describe('hook behavior — selective blocking', () => {
  it('does not block commits when blockCommit=false', async () => {
    const api = makeApi({ extensions: { 'branch-guard': { blockCommit: false } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } }),
    ).toBeUndefined();
  });

  it('still blocks push when blockCommit=false', async () => {
    const api = makeApi({ extensions: { 'branch-guard': { blockCommit: false } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git push origin main' } });
    expect(result?.decision).toBe('block');
  });
});

describe('branch_guard_status tool', () => {
  it('reports config + counters', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const result = await getStatusTool(api).execute({});
    expect(result.enabled).toBe(true);
    expect(result.branches).toEqual(['main', 'master']);
    expect(result.mode).toBe('block');
    expect(result.counters.invocations).toBe(0);
  });
});

describe('teardown + H1 pattern', () => {
  it('logs completion line and does not throw', () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    expect(() => branchGuardPlugin.teardown!(api as never)).not.toThrow();
    expect(api.log.info).toHaveBeenCalledWith(
      'branch-guard: teardown complete',
      expect.any(Object),
    );
  });

  it('zeros counters on teardown', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "x"' } });
    branchGuardPlugin.teardown!(api as never);
    const health = await branchGuardPlugin.health!();
    expect(health.counters.invocations).toBe(0);
    expect(health.counters.blocks).toBe(0);
  });

  it('teardown is safe before setup (defensive)', () => {
    const api = makeApi();
    expect(() => branchGuardPlugin.teardown!(api as never)).not.toThrow();
  });
});

// ── Stash suggestion ────────────────────────────────────────────────────

describe('stash suggestion', () => {
  it('suggests stash when working tree is dirty', async () => {
    setDirty(true);
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('git stash');
    expect(result?.reason).toContain('git checkout -b');
    expect(result?.reason).toContain('git stash pop');
  });

  it('does not suggest stash when working tree is clean', async () => {
    setDirty(false);
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('block');
    expect(result?.reason).not.toContain('git stash');
    expect(result?.reason).toContain('git checkout -b');
  });

  it('warn mode mentions stash when dirty', async () => {
    setDirty(true);
    const api = makeApi({ extensions: { 'branch-guard': { mode: 'warn' } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('allow');
    expect(result?.additionalContext).toContain('git stash');
  });

  it('warn mode does not mention stash when clean', async () => {
    setDirty(false);
    const api = makeApi({ extensions: { 'branch-guard': { mode: 'warn' } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    expect(result?.decision).toBe('allow');
    expect(result?.additionalContext).not.toContain('git stash');
  });
});
