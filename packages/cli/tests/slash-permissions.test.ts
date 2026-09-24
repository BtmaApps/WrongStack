import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { DefaultPermissionPolicy } from '@wrongstack/core/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPermissionsCommand } from '../src/slash-commands/permissions.js';

const bash = {
  name: 'bash',
  description: 'bash',
  inputSchema: { type: 'object' },
  permission: 'confirm',
  mutating: true,
  capabilities: ['shell.arbitrary'],
  subjectKey: 'command',
  async execute() {
    return 'ok';
  },
};

let dir: string;
let policy: DefaultPermissionPolicy;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-permissions-'));
  const trustFile = path.join(dir, 'trust.json');
  await fs.writeFile(trustFile, JSON.stringify({ bash: { deny: ['curl *'] } }));
  policy = new DefaultPermissionPolicy({ trustFile });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function session() {
  const append = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    session: { id: 's1', append },
    meta: {} as Record<string, unknown>,
    cwd: dir,
    projectRoot: dir,
    hasRead: () => false,
  } as unknown as Context;
  const cmd = buildPermissionsCommand({
    toolRegistry: { get: (n: string) => (n === 'bash' ? bash : undefined) },
    permissionPolicy: policy,
  } as never);
  const run = async (args: string) => (await cmd.run(args, ctx))?.message ?? '';
  return { ctx, append, run };
}

describe('/permissions', () => {
  it('adds session rules, journals them, and the policy follows them', async () => {
    const { ctx, append, run } = session();
    expect(await run('')).toContain('No session rules');

    expect(await run('allow bash pnpm test*')).toContain(
      'Session rule added: allow bash pnpm test*',
    );
    expect(append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'permission_overrides',
        overrides: [{ effect: 'allow', tool: 'bash', pattern: 'pnpm test*' }],
      }),
    );
    expect((await policy.evaluate(bash as never, { command: 'pnpm test' }, ctx)).permission).toBe(
      'auto',
    );

    await run('deny bash git push*');
    expect(await run('list')).toMatch(/1\. allow bash pnpm test\*\n\s+2\. deny bash git push\*/);
    expect((await policy.evaluate(bash as never, { command: 'git push' }, ctx)).permission).toBe(
      'deny',
    );

    expect(await run('remove 1')).toContain('removed: allow bash pnpm test*');
    expect((await policy.evaluate(bash as never, { command: 'pnpm test' }, ctx)).permission).toBe(
      'confirm',
    );
    expect(await run('clear')).toContain('Cleared 1 session rule');
    expect(append).toHaveBeenLastCalledWith(expect.objectContaining({ overrides: [] }));
  });

  it('refuses an unknown tool name, but takes a glob', async () => {
    const { run, append } = session();
    expect(await run('allow bsh')).toContain('Unknown tool: "bsh"');
    expect(await run('allow mcp__github__*')).toContain('allow mcp__github__* (any input)');
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('lists the rules with the session’s own rules in place', async () => {
    const { run } = session();
    await run('allow bash pnpm *');
    const out = await run('rules');
    expect(out).toContain('YOLO: off');
    expect(out.indexOf('deny  trust-file      bash → curl *')).toBeLessThan(
      out.indexOf('allow session         bash → pnpm *'),
    );
  });

  it('explains a call against this session, naming the rule', async () => {
    const { run } = session();
    await run('allow bash pnpm *');
    const out = await run('explain bash {"command":"pnpm i"}');
    expect(out).toContain('Effective: auto (source: session_override)');
    expect(out).toMatch(/Rule: #\d+ allow bash → pnpm \* \(session\)/);
    expect(await run('explain bash {not json')).toContain('Invalid input JSON');
  });
});
