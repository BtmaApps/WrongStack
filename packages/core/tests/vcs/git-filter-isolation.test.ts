/**
 * A cloned repository's `.gitattributes` can assign a filter whose command its
 * own `.git/config` names; git runs it whenever status/diff reads that file.
 * `core.fsmonitor=false` alone left it open: the checkpoint adapter and the
 * system-prompt `git status` probe ran the repository's program.
 */
import { execFileSync } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitStatus } from '../../src/core/system-prompt-environment-probes.js';
import { gitConfigEnv, gitFilterIsolationEnv, vcsAdapter } from '../../src/vcs/vcs-adapter.js';
import { removeProjectFixtureDirectory } from '../helpers/project-server-harness.js';

const MARKERS = ['clean-ran.txt', 'process-ran.txt'];

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });

beforeEach(async () => {
  repo = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'wstack-git-filter-')));
  git('init', '-q');
  await fsp.writeFile(path.join(repo, '.gitattributes'), '*.ts filter=evil\n');
  await fsp.writeFile(path.join(repo, 'a.ts'), 'a\n');
  git('add', '.');
  git('-c', 'user.email=t@example.test', '-c', 'user.name=t', 'commit', '-qm', 'one');
  git('config', 'filter.evil.clean', 'echo ran > clean-ran.txt; cat');
  git('config', 'filter.evil.process', 'sh -c "echo ran > process-ran.txt"');
  await fsp.writeFile(path.join(repo, 'a.ts'), 'b\n');
});
afterEach(async () => {
  await removeProjectFixtureDirectory(repo, { maxRetries: 5, retryDelay: 100 });
});

/** The keys an isolation environment sets to empty, sorted. */
const blankedKeys = (env: Record<string, string> | undefined) =>
  Object.entries(env ?? {})
    .filter(([name]) => name.startsWith('GIT_CONFIG_KEY_'))
    .map(([, key]) => key)
    .sort();

const ranFilters = async () => {
  const ran: string[] = [];
  for (const marker of MARKERS) {
    if (await fsp.stat(path.join(repo, marker)).catch(() => undefined)) ran.push(marker);
  }
  return ran;
};

describe('git filter isolation', () => {
  it('blanks exactly the filter commands the repository configures', async () => {
    git('config', 'filter.a.b.smudge', 'x');
    git('config', 'filter.evil.required', 'true');
    // Overriding the user's git-lfs from the repository is the repository's.
    git('config', 'filter.lfs.process', 'evil');
    // A file the repository includes reads as its own (`local`) scope.
    await fsp.writeFile(path.join(repo, 'inc.cfg'), '[filter "inc"]\n\tclean = y\n');
    git('config', 'include.path', '../inc.cfg');
    expect(blankedKeys(await gitFilterIsolationEnv('git', repo))).toEqual([
      'filter.a.b.smudge',
      'filter.evil.clean',
      'filter.evil.process',
      'filter.inc.clean',
      'filter.lfs.process',
    ]);
  });

  it("keeps the user's own filters", async () => {
    git('config', '--remove-section', 'filter.evil');
    // Whatever the machine's system/global config holds (git-lfs on most) is
    // not the repository's to run, and not ours to blank.
    expect(await gitFilterIsolationEnv('git', repo)).toEqual({});
  });

  it('blanks a filter whose name holds "=" (`-c` splits at the first one)', async () => {
    await fsp.writeFile(path.join(repo, '.gitattributes'), '*.ts filter=a=b\n');
    git('config', '--remove-section', 'filter.evil');
    git('config', 'filter.a=b.process', 'sh -c "echo ran > process-ran.txt"');
    expect(blankedKeys(await gitFilterIsolationEnv('git', repo))).toEqual(['filter.a=b.process']);
    expect(await vcsAdapter('git', repo).changedPaths()).toEqual(expect.arrayContaining(['a.ts']));
    expect(await gitStatus(repo)).toContain('modified');
    expect(await ranFilters()).toEqual([]);
  });

  it('appends after GIT_CONFIG_* entries already in the environment', () => {
    expect(gitConfigEnv(['filter.x.clean'], '2')).toEqual({
      GIT_CONFIG_KEY_2: 'filter.x.clean',
      GIT_CONFIG_VALUE_2: '',
      GIT_CONFIG_COUNT: '3',
    });
  });

  it('refuses to run git when the config cannot be listed', async () => {
    await fsp.appendFile(path.join(repo, '.git', 'config'), '\n[broken\n');
    expect(await gitFilterIsolationEnv('git', repo)).toBeUndefined();
    expect(await vcsAdapter('git', repo).changedPaths()).toBeUndefined();
    expect(await gitStatus(repo)).toBe('git error');
    expect(await ranFilters()).toEqual([]);
  });

  it('the checkpoint adapter answers without running the filter', async () => {
    const adapter = vcsAdapter('git', repo);
    expect(await adapter.changedPaths()).toEqual(['a.ts']);
    expect(await adapter.isPristine()).toBe(false);
    expect(await ranFilters()).toEqual([]);
  });

  it('the system-prompt git status probe does not run the filter', async () => {
    const status = await gitStatus(repo);
    expect(status).toContain('1 modified');
    expect(await ranFilters()).toEqual([]);
  });
});
