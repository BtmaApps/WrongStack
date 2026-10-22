/**
 * `baseRef` comes from the model and was passed to git as written:
 * `--output=<path>` made this read-only tool write files (`git diff --output`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codebaseDiffImpactTool } from '../src/codebase-index/codebase-diff-impact-tool.js';

let repo = '';
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'diff-impact-argv-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.test');
  git('config', 'user.name', 't');
  writeFileSync(join(repo, 'a.ts'), 'export function a() { return 1; }\n');
  git('add', '.');
  git('commit', '-qm', 'one');
  writeFileSync(join(repo, 'a.ts'), 'export function a() { return 2; }\n');
  git('commit', '-qam', 'two');
  writeFileSync(join(repo, 'a.ts'), 'export function a() { return 3; }\n');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const run = (input: Record<string, unknown>) =>
  codebaseDiffImpactTool.execute(
    input as never,
    { projectRoot: repo, cwd: repo } as never,
    {} as never,
  );

describe('codebase-diff-impact: baseRef cannot smuggle git options', () => {
  it.each(['--output=pwned.txt', '-p', 'HEAD --output=x', 'main..--output=x', '--end-of-options'])(
    'refuses %j and writes nothing',
    async (baseRef) => {
      await expect(run({ baseRef })).rejects.toThrow(/Invalid baseRef/);
      expect(existsSync(join(repo, 'pwned.txt'))).toBe(false);
      expect(existsSync(join(repo, 'x'))).toBe(false);
    },
  );

  it.each([{}, { baseRef: 'HEAD~1' }, { baseRef: 'main~1..main' }, { baseRef: 'HEAD@{1}' }])(
    'still analyzes %j',
    async (input) => {
      const out = (await run(input)) as { status: string; changedFiles: unknown[] };
      expect(out.status).toBe('ok');
      expect(out.changedFiles.length).toBeGreaterThan(0);
    },
  );

  it('still analyzes staged changes', async () => {
    git('add', 'a.ts');
    const out = (await run({ staged: true })) as { status: string; changedFiles: unknown[] };
    expect(out.status).toBe('ok');
    expect(out.changedFiles.length).toBeGreaterThan(0);
  });
});
