/**
 * WS-2026-09-15 (TD-001 hardening) — `diff` refs must never be filesystem paths.
 *
 * `git diff <x> <y>` switches to `--no-index` when either positional names a
 * path outside the work tree, reading arbitrary files from a permission:'auto'
 * tool. The content was only discarded because git exits 1 on differences —
 * not a control. These tests pin the explicit refusal, and that the git-dir
 * walk stops at projectRoot. Injection-validated: with the pre-fix diff.ts the
 * execute() cases resolve past validation (reaching git) and the bounded-walk
 * case finds the parent repository.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diffTool, refLooksLikeOutsidePath } from '../src/diff.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-outside-ref-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const opts = () => ({ signal: new AbortController().signal });

describe('refLooksLikeOutsidePath', () => {
  it.each([
    '/etc/passwd',
    'C:/Users/x/.ssh/id_rsa',
    'C:\\Users\\x\\.ssh\\id_rsa',
    'C:relative',
    '\\\\server\\share\\file',
    '../secrets.txt',
    'sub/../../escape',
    '..',
  ])('flags %s', (ref) => {
    expect(refLooksLikeOutsidePath(ref)).toBe(true);
  });

  it.each([
    'HEAD',
    'HEAD~2',
    'main',
    'feature/x',
    'main..feature',
    '..feature',
    'main...',
    'v1.2.3',
  ])('allows revision %s', (ref) => {
    expect(refLooksLikeOutsidePath(ref)).toBe(false);
  });
});

describe('diffTool refuses path-shaped refs before touching git', () => {
  // A parent `.git` makes the git path reachable, so a missing refusal would
  // proceed to spawn instead of throwing ToolValidationError.
  beforeEach(async () => {
    await fs.mkdir(path.join(tmpDir, '.git'));
  });

  const ctx = () => ({ cwd: tmpDir, tools: [], projectRoot: tmpDir }) as never;

  it('rejects an absolute `a` (single-ref no-index shape)', async () => {
    await expect(
      diffTool.execute({ a: path.join(os.homedir(), '.ssh', 'id_rsa') }, ctx(), opts()),
    ).rejects.toThrow(/refs may not be filesystem paths/);
  });

  it('rejects a traversal `b`', async () => {
    await expect(
      diffTool.execute({ a: 'HEAD', b: '../../outside.txt' }, ctx(), opts()),
    ).rejects.toThrow(/refs may not be filesystem paths/);
  });
});

describe('diffTool git-dir walk is bounded at projectRoot', () => {
  it('does not adopt a parent repository above projectRoot', async () => {
    await fs.mkdir(path.join(tmpDir, '.git'));
    const project = path.join(tmpDir, 'project');
    await fs.mkdir(project);
    const ctx = { cwd: project, tools: [], projectRoot: project } as never;
    await expect(diffTool.execute({ a: 'HEAD~1', b: 'HEAD' }, ctx, opts())).rejects.toThrow(
      /not a git repository/,
    );
  });
});
