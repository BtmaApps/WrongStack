import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { handleGitCommit } from '../src/server/git-handlers.js';

/** Minimal ws mock that records parsed JSON sends. */
function createMockWs() {
  const ws = {
    readyState: 1,
    sent: [] as Array<{ type: string; payload: Record<string, unknown> }>,
    send(data: string) {
      this.sent.push(JSON.parse(data));
    },
  } as never as WebSocket & { sent: Array<{ type: string; payload: Record<string, unknown> }> };
  return ws;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
}

// The Changes panel commits "Commit (N)" staged files. A pathspec on
// `git commit` switches git to --only and commits working-tree content of
// every modified tracked file instead (F582).
describe('handleGitCommit commits exactly the staged index', () => {
  let repo: string;

  beforeEach(() => {
    repo = path.join(process.env.TEMP || '/tmp', `gitcommit-${randomBytes(4).toString('hex')}`);
    fsSync.mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-q']);
    git(repo, ['config', 'user.email', 'test@test.dev']);
    git(repo, ['config', 'user.name', 'Test']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    fsSync.writeFileSync(path.join(repo, 'a.txt'), 'a0\n');
    fsSync.writeFileSync(path.join(repo, 'b.txt'), 'b0\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'init']);
  });

  afterEach(() => {
    fsSync.rmSync(repo, { recursive: true, force: true });
  });

  it('leaves an unstaged modified file out of the commit', async () => {
    fsSync.writeFileSync(path.join(repo, 'a.txt'), 'a1\n');
    fsSync.writeFileSync(path.join(repo, 'b.txt'), 'b1 not staged\n');
    git(repo, ['add', 'a.txt']);
    const ws = createMockWs();
    await handleGitCommit(ws, repo, 'only a');
    expect(ws.sent.find((m) => m.type === 'git.action_result')?.payload.ok).toBe(true);
    expect(git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD'])).toBe('a.txt');
    expect(git(repo, ['status', '--porcelain'])).toBe('M b.txt');
  });

  it('commits the staged version of a file edited again after staging', async () => {
    fsSync.writeFileSync(path.join(repo, 'a.txt'), 'staged\n');
    git(repo, ['add', 'a.txt']);
    fsSync.writeFileSync(path.join(repo, 'a.txt'), 'staged\nlater edit\n');
    await handleGitCommit(createMockWs(), repo, 'partial');
    expect(git(repo, ['show', 'HEAD:a.txt'])).toBe('staged');
  });
});
