/**
 * Additional tests for branch-guard plugin - covering catch blocks
 * and shouldBlock fallthrough.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Async execFile mock - can be configured to fail specific commands.
let statusShouldThrow = false;
let allShouldThrow = false;
let currentBranch = 'main';
const mockExecFile = vi.fn(
  (
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (error: Error | null, stdout: string) => void,
  ) => {
    const command = args.join(' ');
    const error =
      allShouldThrow || (statusShouldThrow && command.includes('status --porcelain'))
        ? new Error('git failed')
        : null;
    const stdout = command.includes('branch --show-current') ? `${currentBranch}\n` : '';
    queueMicrotask(() => cb(error, error ? '' : stdout));
  },
);

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

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
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onConfigChange: vi.fn(() => vi.fn()),
    onEvent: vi.fn(),
    emitCustom: vi.fn(),
    session: { append: vi.fn().mockResolvedValue(undefined) },
  };
}

function getHook(api: MockApi): (input: unknown) => Promise<unknown> {
  const call = api.registerHook.mock.calls[0];
  if (!call) throw new Error('hook not registered');
  return (call as unknown[])[2] as ReturnType<typeof getHook>;
}

beforeEach(() => {
  vi.clearAllMocks();
  statusShouldThrow = false;
  allShouldThrow = false;
  currentBranch = 'main';
});

describe('branch-guard - branch switches', () => {
  // The branch used to be cached per cwd for 2 s, so a commit right after
  // `git checkout main` was judged against the previous (feature) branch.
  it('judges each guarded call against the branch it runs on now', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api) as (input: unknown) => Promise<{ decision?: string } | void>;
    const commit = { toolName: 'bash', toolInput: { command: 'git commit -m "x"' } };

    currentBranch = 'feat/x';
    expect(await hook(commit)).toBeUndefined();
    currentBranch = 'main';
    expect((await hook(commit))?.decision).toBe('block');
    currentBranch = 'feat/y';
    expect(await hook(commit)).toBeUndefined();
  });

  // A command was judged against the branch current BEFORE it ran, so one
  // that switched to main first (`git checkout main && git merge feat`)
  // merged into main from a feature branch unblocked.
  it('judges each op against the branch an earlier in-command switch moved to', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api) as (input: unknown) => Promise<{ decision?: string } | void>;
    const run = async (command: string) =>
      (await hook({ toolName: 'bash', toolInput: { command } }))?.decision ?? 'allowed';
    currentBranch = 'feat/x';

    expect(await run('git checkout main && git merge feat/x')).toBe('block');
    expect(await run('git switch main; git commit -m hotfix')).toBe('block');
    expect(await run('git commit -m x && git checkout main && git merge feat/x')).toBe('block');
    expect(await run('git checkout -b main origin/main && git push')).toBe('block');
    // not a branch switch / moves off main / new feature branch
    expect(await run('git checkout main -- a.ts && git commit -m restore')).toBe('allowed');
    expect(await run('git checkout -b feat/new && git commit -m y')).toBe('allowed');
    currentBranch = 'main';
    expect(await run('git switch feat/y && git commit -m z')).toBe('allowed');
  });
});

describe('branch-guard - git failure paths', () => {
  it('handles git branch detection failure gracefully', async () => {
    allShouldThrow = true;
    const api = makeApi({ extensions: { 'branch-guard': { mode: 'off' } } });
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api);
    // When git fails, shouldBlock returns false -> hook returns undefined
    expect(
      await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "x"' } }),
    ).toBeUndefined();
  });

  it('handles git status failure gracefully (status throws)', async () => {
    statusShouldThrow = true;
    const api = makeApi(); // mode=block by default
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api) as (input: unknown) => Promise<{ decision?: string } | void>;
    // Trigger with a git commit command - status failure should not crash
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git commit -m "test"' } });
    // When status throws, no stash suggestion but still blocks
    expect(result?.decision).toBe('block');
    statusShouldThrow = false;
  });

  it('allows non-commit/push/merge git operations on protected branch', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api) as (input: unknown) => Promise<{ decision?: string } | void>;
    // 'git log' is a read-only git operation that is not commit/push/merge
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git log --oneline' } });
    expect(result).toBeUndefined();
  });

  it('allows rebase on protected branch (when blockRebase not set)', async () => {
    const api = makeApi();
    branchGuardPlugin.setup(api as never);
    const hook = getHook(api) as (input: unknown) => Promise<{ decision?: string } | void>;
    // 'git rebase' is not commit/push/merge - shouldBlock returns false
    const result = await hook({ toolName: 'bash', toolInput: { command: 'git rebase main' } });
    expect(result).toBeUndefined();
  });
});
