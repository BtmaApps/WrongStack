import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from '../../src/core/context.js';
import { DirectoryPermissionPolicy } from '../../src/security/directory-permission-policy.js';
import { DefaultPermissionPolicy } from '../../src/security/permission-policy.js';
import type { Tool } from '../../src/types/index.js';

/**
 * `explain()` through the directory wrapper must say what decided a call: the
 * directory rule when one applies, and otherwise the inner policy's own step
 * (YOLO, a trust rule, the default) rather than the wrapper's pass-through.
 */

const write = {
  name: 'write',
  description: 'write',
  inputSchema: { type: 'object' },
  permission: 'confirm',
  mutating: true,
  async execute() {
    return 'ok';
  },
} as Tool;

describe('DirectoryPermissionPolicy.explain', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'dir-explain-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const make = (rules: { directory: string; denyTools?: string[] }[], yolo: boolean) =>
    new DirectoryPermissionPolicy(
      new DefaultPermissionPolicy({ trustFile: path.join(root, 'trust.json'), yolo }),
      { policy: { schemaVersion: 1, rules } },
    );
  const ctx = (): Context =>
    ({ meta: {}, projectRoot: root, workingDir: root, cwd: root, hasRead: () => false }) as never;

  it('names the inner step that decided a call no rule touched', async () => {
    const policy = make([{ directory: 'secret', denyTools: ['write'] }], true);
    const input = { path: 'notes.txt', content: 'x' };

    const trace = await policy.explain(write, input, ctx());

    expect(trace.decision).toMatchObject({ permission: 'auto', source: 'yolo' });
    expect(trace.steps[trace.winnerIndex]).toMatchObject({ rule: 'yolo', source: 'yolo' });
    // The wrapper's own steps come first, then the inner policy's.
    expect(trace.steps.map((s) => s.rule)).toContain('directory rules pass through');
    expect(await policy.evaluate(write, input, ctx())).toMatchObject({ permission: 'auto' });
  });

  it('keeps the inner trace when there are no rules at all', async () => {
    const trace = await make([], false).explain(write, { path: 'a.txt', content: 'x' }, ctx());
    expect(trace.decision.permission).toBe('confirm');
    expect(trace.steps[trace.winnerIndex]?.rule).not.toBe('empty directory policy');
    expect(trace.steps[trace.winnerIndex]?.decision).toBe('confirm');
  });

  it('names the directory rule for a file under a plain directory rule', async () => {
    const policy = make([{ directory: 'secret', denyTools: ['write'] }], true);
    const input = { path: 'secret/key.pem', content: 'x' };

    const trace = await policy.explain(write, input, ctx());

    expect(trace.decision).toMatchObject({ permission: 'deny', source: 'directory_rules' });
    expect(trace.steps[trace.winnerIndex]?.rule).toBe('denyTools');
    expect(await policy.evaluate(write, input, ctx())).toMatchObject({ permission: 'deny' });
  });
});
