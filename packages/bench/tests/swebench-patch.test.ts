import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execCommand } from '../src/exec-command.js';
import {
  extractModelPatch,
  extractPatchPaths,
  filterPatchExcludingPaths,
} from '../src/suites/swebench-patch.js';

const git = (cwd: string, ...args: string[]) =>
  execCommand({ command: 'git', args, cwd, timeoutMs: 30_000, shell: false });

let repo: string;

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-swe-patch-'));
  await git(repo, 'init', '-q');
  await git(repo, 'config', 'user.email', 'bench@example.com');
  await git(repo, 'config', 'user.name', 'bench');
  await git(repo, 'config', 'commit.gpgsign', 'false');
  await fs.writeFile(path.join(repo, 'src.py'), 'def f():\n    return 1\n', 'utf8');
  await fs.writeFile(
    path.join(repo, 'test_src.py'),
    'def test_f():\n    assert f() == 2\n',
    'utf8',
  );
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '-q', '-m', 'base');
  // The "agent" edits the source AND (wrongly) a test file, and adds a file.
  await fs.writeFile(path.join(repo, 'src.py'), 'def f():\n    return 2\n', 'utf8');
  await fs.writeFile(
    path.join(repo, 'test_src.py'),
    'def test_f():\n    assert f() == 999\n',
    'utf8',
  );
  await fs.writeFile(path.join(repo, 'newmod.py'), 'X = 1\n', 'utf8');
});

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true });
});

describe('extractModelPatch', () => {
  it('captures modified and newly-added files as a unified diff', async () => {
    const patch = await extractModelPatch({ workdir: repo, timeoutMs: 30_000 });
    expect(patch).toContain('diff --git a/src.py b/src.py');
    expect(patch).toContain('+    return 2');
    expect(patch).toContain('newmod.py'); // new file included
  });

  it('excludes files touched by the held-out test patch', async () => {
    const testPatch =
      'diff --git a/test_src.py b/test_src.py\n--- a/test_src.py\n+++ b/test_src.py\n';
    const patch = await extractModelPatch({ workdir: repo, testPatch, timeoutMs: 30_000 });
    expect(patch).toContain('src.py');
    // The agent's edit to test_src.py must be stripped.
    expect(patch).not.toContain('test_src.py');
  });

  it('strips harness artifacts (.gitignore / .wrongstack) the subprocess writes', async () => {
    // Simulate what wstack boot does: add a .gitignore line and a .wrongstack dir.
    await fs.writeFile(path.join(repo, '.gitignore'), '.wrongstack/\n', 'utf8');
    await fs.mkdir(path.join(repo, '.wrongstack'), { recursive: true });
    await fs.writeFile(path.join(repo, '.wrongstack', 'state.json'), '{}', 'utf8');
    const patch = await extractModelPatch({ workdir: repo, timeoutMs: 30_000 });
    expect(patch).toContain('src.py'); // real edit survives
    expect(patch).not.toContain('.gitignore');
    expect(patch).not.toContain('.wrongstack');
  });

  // The user's git config used to choose the diff format: mnemonicPrefix /
  // noprefix changed the `a/` `b/` headers the test-file filter parses (the
  // held-out test edit leaked into the prediction) and an external diff
  // replaced the patch text entirely.
  it('pins the diff format against the user git config and GIT_EXTERNAL_DIFF', async () => {
    const cfgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-swe-gitcfg-'));
    const cfg = path.join(cfgDir, 'global.gitconfig');
    await fs.writeFile(cfg, '[diff]\n\tmnemonicPrefix = true\n\tnoprefix = true\n', 'utf8');
    const saved = {
      GIT_CONFIG_GLOBAL: process.env['GIT_CONFIG_GLOBAL'],
      GIT_EXTERNAL_DIFF: process.env['GIT_EXTERNAL_DIFF'],
    };
    process.env['GIT_CONFIG_GLOBAL'] = cfg;
    process.env['GIT_EXTERNAL_DIFF'] = 'echo';
    try {
      const testPatch =
        'diff --git a/test_src.py b/test_src.py\n--- a/test_src.py\n+++ b/test_src.py\n';
      const patch = await extractModelPatch({ workdir: repo, testPatch, timeoutMs: 30_000 });
      expect(patch).toContain('diff --git a/src.py b/src.py');
      expect(patch).toContain('+    return 2');
      expect(patch).not.toContain('test_src.py');
      expect(patch.endsWith('\n')).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await fs.rm(cfgDir, { recursive: true, force: true });
    }
  });
});

describe('extractPatchPaths', () => {
  it('reads paths from git and unified-diff headers', () => {
    const paths = extractPatchPaths('diff --git a/foo.py b/foo.py\n--- a/bar.py\n+++ b/baz.py\n');
    expect(paths.has('foo.py')).toBe(true);
    expect(paths.has('bar.py')).toBe(true);
    expect(paths.has('baz.py')).toBe(true);
  });
});

describe('filterPatchExcludingPaths', () => {
  it('drops only the excluded file sections', () => {
    const patch = [
      'diff --git a/keep.py b/keep.py',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/drop.py b/drop.py',
      '@@ -1 +1 @@',
      '-c',
      '+d',
    ].join('\n');
    const out = filterPatchExcludingPaths(patch, new Set(['drop.py']));
    expect(out).toContain('keep.py');
    expect(out).not.toContain('drop.py');
    expect(out).toContain('+b');
    expect(out).not.toContain('+d');
  });

  // A held-out test file usually sorts last. Dropping the LAST section used to
  // take the patch's final newline with it, and `git apply` / `patch` reject a
  // patch cut mid-line — the whole prediction then failed to apply.
  it('keeps the final newline when the last section is dropped', () => {
    const patch =
      'diff --git a/src.py b/src.py\n--- a/src.py\n+++ b/src.py\n@@ -1 +1 @@\n-a\n+b\n' +
      'diff --git a/tests/t.py b/tests/t.py\n--- a/tests/t.py\n+++ b/tests/t.py\n@@ -1 +1 @@\n-x\n+y\n';
    expect(filterPatchExcludingPaths(patch, new Set(['tests/t.py']))).toBe(
      'diff --git a/src.py b/src.py\n--- a/src.py\n+++ b/src.py\n@@ -1 +1 @@\n-a\n+b\n',
    );
    expect(filterPatchExcludingPaths(patch, new Set(['src.py', 'tests/t.py']))).toBe('');
  });

  it('returns the patch unchanged when nothing is excluded', () => {
    const patch = 'diff --git a/x b/x\n';
    expect(filterPatchExcludingPaths(patch, new Set())).toBe(patch);
  });
});
