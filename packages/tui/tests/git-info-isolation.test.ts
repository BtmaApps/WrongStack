/**
 * The status line polls `git status` / `git diff` every few seconds in
 * whatever repository is open. A `.gitattributes` filter whose command the
 * repository's own config names ran on every poll.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGitInfo } from '../src/git-info.js';

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-tui-git-isolation-')));
  git('init', '-q');
  fs.writeFileSync(path.join(repo, '.gitattributes'), '*.ts filter=evil\n');
  fs.writeFileSync(path.join(repo, 'a.ts'), 'a\n');
  git('add', '.');
  git('-c', 'user.email=t@example.test', '-c', 'user.name=t', 'commit', '-qm', 'one');
  git('config', 'filter.evil.clean', 'echo ran > filter-ran.txt; cat');
  git('config', 'filter.evil.process', 'sh -c "echo ran > filter-ran.txt"');
  fs.writeFileSync(path.join(repo, 'a.ts'), 'b\n');
});
afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('readGitInfo isolation', () => {
  it('reads the status without running the repository filter', async () => {
    const info = await readGitInfo(repo);
    expect(info).not.toBeNull();
    expect(fs.existsSync(path.join(repo, 'filter-ran.txt'))).toBe(false);
  });
});
