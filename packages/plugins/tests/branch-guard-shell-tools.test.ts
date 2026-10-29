import { describe, expect, it, vi } from 'vitest';

/**
 * Tool names in a hook matcher match exactly. branch-guard listed only
 * `bash|git|git_autocommit`, so a commit or push on a protected branch from
 * the `pwsh` tool, or through `exec`'s argv, never reached the hook.
 */
const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(
    (
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      const stdout = args.join(' ').includes('branch --show-current') ? 'main\n' : '';
      queueMicrotask(() => cb(null, stdout));
    },
  ),
}));
vi.mock('node:child_process', () => ({ execFile: mockExecFile }));

const { hookMatcherMatches } = await import('@wrongstack/core/hooks');
const plugin = (await import('../src/branch-guard')).default;

function registered() {
  const api = {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onConfigChange: vi.fn(() => vi.fn()),
  };
  plugin.setup(api as never);
  const [, matcher, hook] = api.registerHook.mock.calls[0] as unknown as [
    string,
    string,
    (i: unknown) => Promise<{ decision?: string } | undefined>,
  ];
  return async (toolName: string, toolInput: unknown) =>
    hookMatcherMatches(matcher, toolName)
      ? (await hook({ toolName, toolInput }))?.decision
      : 'not-run';
}

describe('branch-guard: every shell tool reaches the hook', () => {
  it('blocks pwsh and exec commits and pushes on a protected branch', async () => {
    const run = registered();
    expect(await run('pwsh', { command: 'git commit -m x' })).toBe('block');
    expect(await run('pwsh', { command: 'git push origin main' })).toBe('block');
    expect(await run('exec', { command: 'git', args: ['commit', '-m', 'two words'] })).toBe(
      'block',
    );
  });

  it('leaves read-only git alone', async () => {
    const run = registered();
    expect(await run('pwsh', { command: 'git status' })).toBeUndefined();
    expect(await run('exec', { command: 'git', args: ['log', '-1'] })).toBeUndefined();
  });
});
