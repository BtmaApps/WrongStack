import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPackageManager, ensureInsideRoot, safeResolve } from '../src/_util.js';

// The syntactic containment predicate behind `ensureInsideRoot`/`safeResolve`
// (isInsideAny) used a bare `rel.startsWith('..')`, which misreads a LEGAL
// in-root first segment that begins with '..' (`..hidden/theme.css` → rel
// "..hidden\theme.css") as an escape — the read/edit/write tool family then
// refused paths that live inside the project. Same class as the design.ts
// materialize/verify guards (r29/r30) and sage's anchorsPresentOnDisk.
// Canonical predicate: rel === '..' || rel.startsWith('..' + sep) || isAbsolute.
describe('dot-prefixed in-root names pass tool path containment', () => {
  let projectDir: string;
  let outsideDir: string;

  const ctx = () =>
    ({
      projectRoot: projectDir,
      cwd: projectDir,
      workingDir: projectDir,
      allowOutsideProjectRoot: false,
    }) as never;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-dotdot-in-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-dotdot-out-'));
    await fs.mkdir(path.join(projectDir, '..hidden'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '..hidden', 'theme.css'), 'x', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('ensureInsideRoot accepts a legal in-root ..-prefixed path', () => {
    const target = path.join(projectDir, '..hidden', 'theme.css');
    expect(ensureInsideRoot(target, ctx())).toBe(path.resolve(target));
  });

  it('safeResolve accepts a ..-prefixed relative input', () => {
    const resolved = safeResolve('..hidden/theme.css', ctx());
    expect(path.resolve(resolved)).toBe(path.resolve(projectDir, '..hidden', 'theme.css'));
  });

  it('still rejects real ../ escapes (tightness control)', () => {
    const outside = path.join(outsideDir, 'leak.txt');
    expect(() => ensureInsideRoot(outside, ctx())).toThrow(/outside project root/);
    expect(() => safeResolve('../leak.txt', ctx())).toThrow(/outside project root/);
  });

  it('detectPackageManager walks through an in-root ..-prefixed ancestor', async () => {
    // proj/..dot/pkg has no lockfile; the walk must continue through `..dot`
    // up to proj and find its packageManager declaration.
    await fs.mkdir(path.join(projectDir, '..dot', 'pkg'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@12.3.4' }),
      'utf8',
    );
    const detected = await detectPackageManager(path.join(projectDir, '..dot', 'pkg'), projectDir);
    expect(detected).toBe('pnpm');
  });
});
