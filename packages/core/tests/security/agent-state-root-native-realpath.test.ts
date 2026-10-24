/**
 * Platform-independent pin for the 8.3 short-name fix in
 * `isInsideAgentStateRoot` (see agent-state-root-shortname.test.ts for the
 * real-filesystem Windows case).
 *
 * The stub reproduces the only property that matters: the JS
 * `fs.realpathSync` keeps an alias spelling verbatim while
 * `fs.realpathSync.native` resolves it to the root's long name. Two defects
 * combined into the bypass, and both are asserted here:
 *   1. the subject was resolved with the JS realpath, and
 *   2. the subject's realpath was skipped whenever the ROOT was not a link.
 */
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ROOT = path.resolve('/virt-home/.wrongstack');
const ALIAS = path.resolve('/virt-home/WRONGS~1');

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  // JS realpath: keeps the alias (what Node's JS implementation does on win32).
  const realpathSync = Object.assign((p: string) => String(p), {
    // Native realpath: expands the alias to the long name.
    native: (p: string) => String(p).replace(/WRONGS~1/i, '.wrongstack'),
  });
  return { ...actual, realpathSync, default: { ...actual, realpathSync } };
});

const { isInsideAgentStateRoot, inputPathLooksSensitive } = await import(
  '../../src/security/permission-helpers.js'
);

let prevHome: string | undefined;
beforeAll(() => {
  prevHome = process.env['WRONGSTACK_HOME'];
  process.env['WRONGSTACK_HOME'] = ROOT;
});
afterAll(() => {
  if (prevHome === undefined) delete process.env['WRONGSTACK_HOME'];
  else process.env['WRONGSTACK_HOME'] = prevHome;
});

describe('isInsideAgentStateRoot resolves the subject with the native realpath', () => {
  it('treats an alias spelling of the root as inside it', () => {
    expect(isInsideAgentStateRoot(path.join(ALIAS, 'config.json'))).toBe(true);
  });

  it('flags a read of config.json through the alias as sensitive', () => {
    expect(inputPathLooksSensitive({ path: path.join(ALIAS, 'config.json') })).toBe(true);
    expect(inputPathLooksSensitive({ path: path.join(ALIAS, 'trust.json') })).toBe(true);
  });

  it('control: an unrelated path stays outside and unflagged', () => {
    const other = path.resolve('/virt-home/project/config.json');
    expect(isInsideAgentStateRoot(other)).toBe(false);
    expect(inputPathLooksSensitive({ path: other })).toBe(false);
  });

  it('control: non-sensitive files under the alias are inside but not flagged', () => {
    const memo = path.join(ALIAS, 'memory.md');
    expect(isInsideAgentStateRoot(memo)).toBe(true);
    expect(inputPathLooksSensitive({ path: memo })).toBe(false);
  });
});
