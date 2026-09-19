import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAndValidateWorkingDir } from '../../src/core/context-working-dir.js';

// `resolveAndValidateWorkingDir` used a bare `rel.startsWith('..')` (lexical
// and realpath layers), which misread a LEGAL in-root working directory whose
// first segment begins with '..' as an escape. Canonical predicate:
// rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel).
describe('resolveAndValidateWorkingDir (dot-prefixed in-root names)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-cwd-dotdot-'));
    await fs.mkdir(path.join(root, '..configs'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts a legal in-root ..-prefixed working directory (absolute)', () => {
    const dir = path.join(root, '..configs');
    expect(resolveAndValidateWorkingDir(dir, root, false)).toBe(path.resolve(dir));
  });

  it('accepts a ..-prefixed relative working directory', () => {
    expect(resolveAndValidateWorkingDir('..configs', root, false)).toBe(
      path.resolve(root, '..configs'),
    );
  });

  it('still rejects real parent traversal (tightness control)', () => {
    const outside = path.resolve(root, '..', 'outside');
    expect(() => resolveAndValidateWorkingDir(outside, root, false)).toThrow(
      /outside project root/,
    );
  });

  it('allowOutsideProjectRoot still permits genuinely outside dirs', () => {
    const outside = path.resolve(root, '..', 'outside-allowed');
    expect(resolveAndValidateWorkingDir(outside, root, true)).toBe(path.resolve(outside));
  });
});
