/**
 * The git panel refreshes on its own in whatever repository is open. A
 * `.gitattributes` filter whose command the repository's own config names
 * ran on every `status`/`diff` it issued.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeGit } from '../src/server/git-history.js';

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wstack-webui-git-isolation-')));
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

describe('makeGit isolation', () => {
  it('reads status and numstat without running the repository filter', async () => {
    const run = makeGit(repo);
    expect(await run(['status', '--porcelain', '-z'])).toContain('a.ts');
    expect(await run(['diff', '--numstat', '-z'])).toContain('a.ts');
    expect(fs.existsSync(path.join(repo, 'filter-ran.txt'))).toBe(false);
  });
});
