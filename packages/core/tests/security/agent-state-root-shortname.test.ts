/**
 * An 8.3 short-name spelling of the agent-state root must not turn a read of
 * `config.json` into a silent auto-approval (Windows).
 *
 * `~/.wrongstack` usually has an 8.3 alias (`WRONGS~1`). `isInsideAgentStateRoot`
 * resolved subjects with the JS `fs.realpathSync`, which keeps the alias
 * verbatim, and skipped the subject's realpath altogether whenever the root was
 * not itself a link. So `<home>\WRONGS~1\config.json` — the very same file as
 * `<home>\.wrongstack\config.json` — was neither "inside the root" nor a
 * sensitive read: the leader auto-approved it with no prompt and a subagent was
 * allowed to read it. Only `realpathSync.native` expands an 8.3 name.
 *
 * Real filesystem, hermetic WRONGSTACK_HOME. The hostile case needs Windows and
 * a volume that generates 8.3 names; elsewhere it records why it could not run
 * (a platform-independent stub of the same mechanism lives in
 * agent-state-root-native-realpath.test.ts).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Tool } from '@wrongstack/contracts/types/tool';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/core/context.js';
import { AutoApprovePermissionPolicy } from '../../src/security/auto-approve-policy.js';
import { DefaultPermissionPolicy } from '../../src/security/permission-policy.js';

const readTool = {
  name: 'read',
  description: 'read',
  inputSchema: { type: 'object' },
  permission: 'auto',
  mutating: false,
  capabilities: ['fs.read'],
  async execute() {
    return 'ok';
  },
} as Tool;

const FIXTURE = 'hermetic-fixture-body';

let parent: string;
let root: string;
let shortAlias: string | undefined;
let prevHome: string | undefined;

/** The 8.3 alias `dir /x` reports for `dir`, or undefined when none exists. */
function shortNameOf(dir: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const out = spawnSync('cmd', ['/c', 'dir', '/x', '/a', path.dirname(dir)], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const base = path.basename(dir).toLowerCase();
  for (const line of (out.stdout ?? '').split(/\r?\n/)) {
    const match = /<DIR>\s+(\S+~\S*)\s+(.+)$/.exec(line.trim());
    if (match?.[2]?.trim().toLowerCase() === base) return match[1];
  }
  return undefined;
}

beforeAll(() => {
  prevHome = process.env['WRONGSTACK_HOME'];
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-shortname-'));
  root = path.join(parent, '.wrongstack');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'config.json'), FIXTURE);
  process.env['WRONGSTACK_HOME'] = root;
  shortAlias = shortNameOf(root);
});

afterAll(() => {
  if (prevHome === undefined) delete process.env['WRONGSTACK_HOME'];
  else process.env['WRONGSTACK_HOME'] = prevHome;
  fs.rmSync(parent, { recursive: true, force: true });
});

const ctx = () =>
  ({ projectRoot: parent, workingDir: parent, cwd: parent, meta: {} }) as unknown as Context;

describe('agent-state root reached through an 8.3 short name', () => {
  it('prompts the leader for a read through the alias (and honours the answer)', async (t) => {
    if (!shortAlias) {
      t.annotate(`no 8.3 alias on ${process.platform} for the temp root — not observable here`);
      return;
    }
    const alias = path.join(parent, shortAlias, 'config.json');
    expect(fs.readFileSync(alias, 'utf8')).toBe(FIXTURE); // genuinely the same file
    const prompt = vi.fn().mockResolvedValue('deny');
    const policy = new DefaultPermissionPolicy({
      trustFile: path.join(parent, 'trust.json'),
      promptDelegate: prompt,
    });

    const decision = await policy.evaluate(readTool, { path: alias }, ctx());

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(decision.permission).toBe('deny');
  });

  it('denies a subagent read through the alias', async (t) => {
    if (!shortAlias) {
      t.annotate(`no 8.3 alias on ${process.platform} for the temp root — not observable here`);
      return;
    }
    const alias = path.join(parent, shortAlias, 'config.json');
    const policy = new AutoApprovePermissionPolicy(undefined, { trustFile: '' });

    const decision = await policy.evaluate(readTool, { path: alias }, ctx() as never);

    expect(decision.permission).toBe('deny');
    expect(decision.source).toBe('subagent_guard');
  });

  it('control: the canonical spelling still needs approval', async () => {
    const policy = new DefaultPermissionPolicy({ trustFile: path.join(parent, 'trust.json') });
    const decision = await policy.evaluate(
      readTool,
      { path: path.join(root, 'config.json') },
      ctx(),
    );
    expect(decision.permission).not.toBe('auto');
  });

  it('control: an ordinary project file is still auto-approved', async () => {
    const policy = new DefaultPermissionPolicy({ trustFile: path.join(parent, 'trust.json') });
    const decision = await policy.evaluate(
      readTool,
      { path: path.join(parent, 'src', 'a.ts') },
      ctx(),
    );
    expect(decision.permission).toBe('auto');
  });
});
