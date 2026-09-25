/**
 * The VCS adapter over git, jj and hg. Parsing runs everywhere against a fake
 * runner; the real binaries run when they are installed (jj and hg are found
 * on PATH or through WSTACK_TEST_JJ / WSTACK_TEST_HG).
 */
import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionCheckpointCas } from '../../src/storage/session-checkpoint-cas.js';
import { detectVcs, openVcs, type VcsKind, vcsAdapter } from '../../src/vcs/vcs-adapter.js';
import { runVcs, type VcsRunResult } from '../../src/vcs/vcs-runner.js';

const execFileAsync = promisify(execFile);
const REV = 'ab'.repeat(20);

let tmp: string;
beforeEach(async () => {
  tmp = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-vcs-')));
});
afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A runner that answers by the command, recording what it was asked. */
function fakeRunner(answers: Record<string, Partial<VcsRunResult>>) {
  const calls: string[] = [];
  const runner = async (binary: string, args: readonly string[]) => {
    const key = [binary, ...args].join(' ');
    calls.push(key);
    const hit = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
    return { code: 0, stdout: '', stderr: '', ...(hit?.[1] ?? { code: 1 }) };
  };
  return { runner, calls };
}

describe('detectVcs', () => {
  it('finds the nearest repository and prefers git in a colocated jj repository', async () => {
    const repo = path.join(tmp, 'repo');
    await fsp.mkdir(path.join(repo, '.jj'), { recursive: true });
    await fsp.mkdir(path.join(repo, 'a', 'b'), { recursive: true });
    expect(await detectVcs(path.join(repo, 'a', 'b'))).toEqual({ kind: 'jj', root: repo });
    await fsp.mkdir(path.join(repo, '.git'));
    expect(await detectVcs(path.join(repo, 'a'))).toEqual({ kind: 'git', root: repo });
    // A nested hg repository is nearer than the outer one.
    await fsp.mkdir(path.join(repo, 'a', '.hg'));
    expect(await detectVcs(path.join(repo, 'a', 'b'))).toEqual({
      kind: 'hg',
      root: path.join(repo, 'a'),
    });
  });

  it('reads the .git file of a git worktree as git', async () => {
    await fsp.writeFile(path.join(tmp, '.git'), 'gitdir: /elsewhere\n');
    expect(await detectVcs(tmp)).toEqual({ kind: 'git', root: tmp });
    // A `.jj` or `.hg` file is not a repository.
    const other = path.join(tmp, 'other');
    await fsp.mkdir(other);
    await fsp.writeFile(path.join(other, '.hg'), '');
    expect((await detectVcs(other))?.root).toBe(tmp);
  });
});

describe('adapters against a fake runner', () => {
  it('git: base, changes from both diff and untracked, pristine, branch', async () => {
    const { runner } = fakeRunner({
      'git rev-parse': { stdout: `${REV.toUpperCase()}\n` },
      'git diff': { stdout: 'src/a.ts\0gone.txt\0' },
      'git ls-files': { stdout: 'src/a.ts\0new\\file.ts\0' },
      'git status': { stdout: '!! build/\0' },
      'git symbolic-ref': { stdout: 'main\n' },
    });
    const git = vcsAdapter('git', tmp, { runner });
    expect(await git.baseRevision()).toBe(REV);
    expect(await git.changedPaths()).toEqual(['src/a.ts', 'gone.txt', 'new/file.ts']);
    // An ignored file makes a checkout not pristine.
    expect(await git.isPristine()).toBe(false);
    expect(await git.currentBranch()).toBe('main');
  });

  it('jj: the parent of the working-copy commit, and one parent only', async () => {
    const { runner, calls } = fakeRunner({
      'jj --color=never log -r @- --no-graph -T commit_id': { stdout: `${REV}\n` },
      'jj --color=never diff': { stdout: 'a.txt\r\nsub\\new.txt\r\n' },
      'jj --color=never log -r @- --no-graph -T local_bookmarks': { stdout: 'feature\n' },
    });
    const jj = vcsAdapter('jj', tmp, { runner });
    expect(await jj.baseRevision()).toBe(REV);
    expect(await jj.changedPaths()).toEqual(['a.txt', 'sub/new.txt']);
    expect(await jj.isPristine()).toBe(false);
    expect(await jj.currentBranch()).toBe('feature');
    expect(calls[0]).toContain('commit_id ++ "\\n"');

    const merge = fakeRunner({
      'jj --color=never log': { stdout: `${REV}\n${'cd'.repeat(20)}\n` },
    });
    expect(await vcsAdapter('jj', tmp, { runner: merge.runner }).baseRevision()).toBeUndefined();
  });

  it('hg: the null revision is no base; status covers untracked, and ignored for pristine', async () => {
    const { runner, calls } = fakeRunner({
      'hg log -r . -T {node}': { stdout: `${'0'.repeat(40)}\n` },
      'hg status -mardu ': { stdout: 'a.txt\0sub\\new.txt\0' },
      'hg status -mardui ': { stdout: '' },
      'hg log -r . -T {activebookmark}': { stdout: '' },
      'hg branch': { stdout: 'default\n' },
    });
    const hg = vcsAdapter('hg', tmp, { runner });
    expect(await hg.baseRevision()).toBeUndefined();
    expect(await hg.changedPaths()).toEqual(['a.txt', 'sub/new.txt']);
    expect(await hg.isPristine()).toBe(true);
    expect(await hg.currentBranch()).toBe('default');
    expect(calls).toContain('hg status -mardu -n -0');
  });

  it('answers undefined, not "nothing changed", when a command fails or is cut off', async () => {
    const failing = fakeRunner({ 'git ls-files': { code: 128 }, 'git diff': { stdout: '' } });
    expect(await vcsAdapter('git', tmp, { runner: failing.runner }).changedPaths()).toBeUndefined();
    const cut = fakeRunner({ 'git status': { stdout: '', stdoutTruncated: true } });
    expect(await vcsAdapter('git', tmp, { runner: cut.runner }).isPristine()).toBeUndefined();
    // Paths that leave the root are dropped.
    const escaping = fakeRunner({ 'hg status': { stdout: '../outside\0/abs\0C:\\abs\0ok\0' } });
    expect(await vcsAdapter('hg', tmp, { runner: escaping.runner }).changedPaths()).toEqual(['ok']);
  });

  it('a missing binary reads as no answer', async () => {
    const jj = vcsAdapter('jj', tmp, { binaries: { jj: 'wstack-no-such-vcs-binary' } });
    expect(await jj.baseRevision()).toBeUndefined();
    expect(await jj.changedPaths()).toBeUndefined();
  });
});

async function available(binary: string): Promise<boolean> {
  return (await runVcs(binary, ['--version'], os.tmpdir())).code === 0;
}

const JJ = process.env.WSTACK_TEST_JJ || 'jj';
const HG = process.env.WSTACK_TEST_HG || 'hg';
const hasJj = await available(JJ);
const hasHg = await available(HG);

/** Two files committed, then one edited, one added, one deleted and one ignored. */
async function exerciseRealRepo(
  kind: VcsKind,
  repo: string,
  commit: () => Promise<void>,
  ignoreFile: [string, string],
) {
  await fsp.mkdir(path.join(repo, 'sub'), { recursive: true });
  await fsp.writeFile(path.join(repo, 'a.txt'), 'a\n');
  await fsp.writeFile(path.join(repo, 'del.txt'), 'd\n');
  const binaries = { jj: JJ, hg: HG };
  const vcs = await openVcs(path.join(repo, 'sub'), { binaries });
  expect(vcs?.kind).toBe(kind);
  expect(vcs?.root).toBe(repo);
  expect(await vcs?.baseRevision()).toBeUndefined();

  await commit();
  const base = await vcs?.baseRevision();
  expect(base).toMatch(/^[a-f\d]{40}$/);
  expect(await vcs?.isPristine()).toBe(true);

  await fsp.writeFile(path.join(repo, ignoreFile[0]), ignoreFile[1]);
  await fsp.writeFile(path.join(repo, 'a.txt'), 'a changed\n');
  await fsp.writeFile(path.join(repo, 'sub', 'new.txt'), 'n\n');
  await fsp.rm(path.join(repo, 'del.txt'));
  await fsp.writeFile(path.join(repo, 'ignored.log'), 'x\n');
  expect((await vcs?.changedPaths())?.sort()).toEqual(
    [ignoreFile[0], 'a.txt', 'del.txt', 'sub/new.txt'].sort(),
  );
  expect(await vcs?.isPristine()).toBe(false);
  expect(await vcs?.baseRevision()).toBe(base);
  return vcs;
}

describe('adapters against the real binaries', () => {
  it('git', async () => {
    const repo = path.join(tmp, 'git-repo');
    await fsp.mkdir(repo);
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repo, windowsHide: true });
    await git('init', '-q', '-b', 'trunk');
    const vcs = await exerciseRealRepo(
      'git',
      repo,
      async () => {
        await git('add', '.');
        await git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'one');
      },
      ['.gitignore', '*.log\n'],
    );
    expect(await vcs?.currentBranch()).toBe('trunk');
  });

  it.skipIf(!hasJj)('jj (a repository without git colocation)', async () => {
    const repo = path.join(tmp, 'jj-repo');
    await fsp.mkdir(repo);
    const jj = (...args: string[]) => execFileAsync(JJ, args, { cwd: repo, windowsHide: true });
    await jj('git', 'init', '--no-colocate');
    const vcs = await exerciseRealRepo(
      'jj',
      repo,
      async () => {
        await jj('--config', 'user.name=t', '--config', 'user.email=t@t', 'commit', '-m', 'one');
        await jj('bookmark', 'create', 'feature', '-r', '@-');
      },
      ['.gitignore', '*.log\n'],
    );
    expect(await vcs?.currentBranch()).toBe('feature');
  });

  it.skipIf(!hasHg)('hg', async () => {
    const repo = path.join(tmp, 'hg-repo');
    await fsp.mkdir(repo);
    const hg = (...args: string[]) =>
      execFileAsync(HG, args, {
        cwd: repo,
        windowsHide: true,
        env: { ...process.env, HGPLAIN: '1' },
      });
    await hg('init');
    const vcs = await exerciseRealRepo(
      'hg',
      repo,
      async () => {
        await hg('add', '-q');
        await hg('commit', '-q', '-u', 't', '-m', 'one');
      },
      ['.hgignore', 'syntax: glob\n*.log\n'],
    );
    expect(await vcs?.currentBranch()).toBe('default');
  });

  it('a checkpoint of a project in a subdirectory of the repository keeps project paths', async () => {
    const repo = path.join(tmp, 'mono');
    const project = path.join(repo, 'packages', 'app');
    await fsp.mkdir(path.join(project, 'src'), { recursive: true });
    await fsp.writeFile(path.join(project, 'src', 'a.ts'), 'base\n');
    await fsp.writeFile(path.join(repo, 'root.txt'), 'root\n');
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repo, windowsHide: true });
    await git('init', '-q');
    await git('add', '.');
    await git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
    await fsp.writeFile(path.join(project, 'src', 'a.ts'), 'changed\n');
    await fsp.writeFile(path.join(repo, 'root.txt'), 'changed outside the project\n');

    const cas = new SessionCheckpointCas({ rootDir: path.join(tmp, 'cas'), projectRoot: project });
    const checkpoint = await cas.capture('mono', 0);
    // Only the project's file, recorded relative to the project.
    expect(checkpoint).toMatchObject({ entryCount: 1, unresolvedCount: 0 });
    const manifest = JSON.parse(
      await fsp.readFile(
        path.join(tmp, 'cas', 'manifests', `${checkpoint?.manifestHash}.json`),
        'utf8',
      ),
    ) as { entries: Array<{ path: string }> };
    expect(manifest.entries.map((e) => e.path)).toEqual(['src/a.ts']);
  });
});
