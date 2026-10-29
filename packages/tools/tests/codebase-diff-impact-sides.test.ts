/**
 * The invariant check read the left ref against the working tree whatever the
 * mode: a staged diff, `a..b` and `a...b` reported export deletions that the
 * analyzed diff never contained (the working tree's WIP, main's later commits).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codebaseDiffImpactTool } from '../src/codebase-index/codebase-diff-impact-tool.js';

let repo = '';
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();
const write = (body: string) => writeFileSync(join(repo, 'a.ts'), body);
const run = async (input: Record<string, unknown>) =>
  (
    (await codebaseDiffImpactTool.execute(
      input as never,
      { projectRoot: repo, cwd: repo } as never,
      {} as never,
    )) as {
      invariantViolations: Array<{ ruleId: string; symbolName: string }>;
    }
  ).invariantViolations.map((v) => `${v.ruleId}:${v.symbolName}`);
const AB = 'export function a() { return 1; }\nexport function b() { return 1; }\n';

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'diff-impact-sides-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.test');
  git('config', 'user.name', 't');
  write(AB);
  git('add', '.');
  git('commit', '-qm', 'base');
  git('branch', 'feature');
  write(`${AB}export function c() { return 1; }\n`);
  git('commit', '-qam', 'main adds c');
  git('checkout', '-q', 'feature');
  write('export function a() { return 2; }\n'); // feature really deletes b
  git('commit', '-qam', 'feature edits a, deletes b');
  write('export function a() { return 3; }\nexport function z() { return 1; }\n');
  git('add', 'a.ts'); // staged: re-adds nothing but adds z
  write('export function q() { return 1; }\n'); // unstaged: a and z deleted
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('codebase-diff-impact: compares the sides git diff compared', () => {
  it('ranges report the deletion that is in the range, and nothing from main or the working tree', async () => {
    expect(await run({ baseRef: 'main...feature' })).toEqual(['INV-001:b']);
    expect(await run({ baseRef: 'main...' })).toEqual(['INV-001:b']); // empty right = HEAD
    expect(await run({ baseRef: 'feature~1..feature' })).toEqual(['INV-001:b']);
    expect(await run({ baseRef: '..feature' })).toEqual([]); // HEAD..feature: same commit, no diff
  });

  it('staged compares the base against the index, not the working tree', async () => {
    expect(await run({ staged: true })).toEqual([]);
    expect(await run({ staged: true, baseRef: 'HEAD~1' })).toEqual(['INV-001:b']);
  });

  it('the working-tree diff still reads the working tree', async () => {
    expect((await run({})).sort()).toEqual(['INV-001:a']);
  });
});
