import type { PermissionRequest } from '@wrongstack/acp';
import type { PermissionDecision, Tool } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import { wrongstackAcpPermissionPolicy } from '../src/fleet/acp-permission-bridge.js';

const ROOT = 'D:/proj';

function request(
  kind: string,
  rawInput: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  signal = new AbortController().signal,
): PermissionRequest {
  return {
    toolCall: { sessionUpdate: 'tool_call_update', toolCallId: 'c1', kind, rawInput, ...extra },
    options: [
      { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
      { optionId: 'allow-with-updates', name: 'Always', kind: 'allow_always' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
    signal,
  } as unknown as PermissionRequest;
}

/** The WrongStack call the policy is asked about for `req`, or undefined when none is. */
async function wrongstackCallFor(req: PermissionRequest) {
  let seen: { tool: string; input: unknown } | undefined;
  const policy = wrongstackAcpPermissionPolicy({
    evaluate: async (tool, input) => {
      seen = { tool: tool.name, input };
      return { permission: 'auto', source: 'default' };
    },
    getTool: (name) => ({ name }) as Tool,
    projectRoot: ROOT,
  });
  await policy(req);
  return seen;
}

describe('request translation', () => {
  it("maps Claude's requests to the WrongStack call with the same effect", async () => {
    expect(
      await wrongstackCallFor(request('execute', { command: 'bun test', description: 'x' })),
    ).toEqual({
      tool: 'bash',
      input: { command: 'bun test' },
    });
    expect(
      await wrongstackCallFor(request('edit', { file_path: `${ROOT}/a.ts`, content: 'x' })),
    ).toEqual({ tool: 'write', input: { path: `${ROOT}/a.ts`, content: 'x' } });
    expect(
      await wrongstackCallFor(
        request('edit', { file_path: `${ROOT}/a.ts`, old_string: 'a', new_string: 'b' }),
      ),
    ).toEqual({ tool: 'edit', input: { path: `${ROOT}/a.ts`, old_string: 'a', new_string: 'b' } });
    expect(
      await wrongstackCallFor(request('fetch', { url: 'https://x.dev', prompt: 'p' })),
    ).toEqual({
      tool: 'fetch',
      input: { url: 'https://x.dev' },
    });
    expect(
      await wrongstackCallFor(request('delete', {}, { locations: [{ path: `${ROOT}/old.ts` }] })),
    ).toEqual({ tool: 'bash', input: { command: `rm "${ROOT}/old.ts"` } });
    expect(await wrongstackCallFor(request('read', { file_path: '~/.aws/credentials' }))).toEqual({
      tool: 'read',
      input: { path: '~/.aws/credentials' },
    });
  });

  it("leaves the worker's own tools (MCP, todo lists) to the worker", async () => {
    expect(await wrongstackCallFor(request('other', { query: 'x' }))).toBeUndefined();
    expect(await wrongstackCallFor(request('execute', {}))).toBeUndefined();
  });
});

describe('wrongstackAcpPermissionPolicy', () => {
  const tools: Record<string, Tool> = {
    bash: { name: 'bash' } as Tool,
    fetch: { name: 'fetch' } as Tool,
  };
  const decide = (permission: PermissionDecision['permission'], reason?: string) =>
    vi.fn(
      async (): Promise<PermissionDecision> => ({ permission, source: 'subagent_guard', reason }),
    );

  it('answers allow-once when WrongStack approves, never a standing allow', async () => {
    const evaluate = decide('auto');
    const policy = wrongstackAcpPermissionPolicy({
      evaluate,
      getTool: (n) => tools[n],
      projectRoot: ROOT,
    });
    await expect(policy(request('execute', { command: 'bun test' }))).resolves.toEqual({
      outcome: 'selected',
      optionId: 'allow-once',
    });
    expect(evaluate).toHaveBeenCalledWith(
      tools.bash,
      { command: 'bun test' },
      {
        projectRoot: ROOT,
        cwd: ROOT,
      },
    );
  });

  it('rejects what WrongStack refuses or would ask about, and says why', async () => {
    const refused = vi.fn();
    for (const permission of ['deny', 'confirm'] as const) {
      const policy = wrongstackAcpPermissionPolicy({
        evaluate: decide(permission, 'git-history commands are gated'),
        getTool: (n) => tools[n],
        projectRoot: ROOT,
        onRefused: refused,
      });
      await expect(policy(request('execute', { command: 'git push --force' }))).resolves.toEqual({
        outcome: 'selected',
        optionId: 'reject',
      });
    }
    expect(refused).toHaveBeenCalledWith(
      { tool: 'bash', input: { command: 'git push --force' } },
      'git-history commands are gated',
    );
  });

  it('fails closed when the policy throws, and cancels an aborted request', async () => {
    const policy = wrongstackAcpPermissionPolicy({
      evaluate: vi.fn(async () => {
        throw new Error('trust file unreadable');
      }),
      getTool: (n) => tools[n],
      projectRoot: ROOT,
    });
    await expect(policy(request('fetch', { url: 'https://x.dev' }))).resolves.toEqual({
      outcome: 'selected',
      optionId: 'reject',
    });
    const ac = new AbortController();
    ac.abort();
    await expect(
      policy(request('fetch', { url: 'https://x.dev' }, {}, ac.signal)),
    ).resolves.toEqual({ outcome: 'cancelled' });
  });

  it('allows calls with no WrongStack counterpart without asking the policy', async () => {
    const evaluate = decide('deny');
    const policy = wrongstackAcpPermissionPolicy({
      evaluate,
      getTool: (n) => tools[n],
      projectRoot: ROOT,
    });
    await expect(policy(request('other', { server: 'wrongstack-index' }))).resolves.toEqual({
      outcome: 'selected',
      optionId: 'allow-once',
    });
    await expect(
      policy(request('edit', { file_path: `${ROOT}/a.ts`, content: '' })),
    ).resolves.toEqual({ outcome: 'selected', optionId: 'allow-once' });
    expect(evaluate).not.toHaveBeenCalled();
  });
});
