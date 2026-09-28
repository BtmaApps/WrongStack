/**
 * `wstack typesafe lint-conventions` parses `git diff`. The diff format used to
 * come from the user's git config: under diff.mnemonicPrefix the `+++` path is
 * `w/src/x.ts`, findSemanticLintCandidates strips only `b/`, so findings named
 * a wrong file and a rule anchored with `files: "^src/"` never matched. The
 * judge is faked; git, the rules file and the handler are real.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wrongstack/core/typesafe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/core/typesafe')>();
  return {
    ...actual,
    resolveTypeSafeJudge: () => ({}),
    // Every candidate is a violation: the test is about which lines/files the
    // handler finds, not about the model's verdict.
    judgeSemanticLintCandidates: async (
      _judge: unknown,
      _rules: unknown,
      candidates: Array<{ ruleId: string; file: string; line: number; text: string }>,
    ) => ({
      findings: candidates.map((c) => ({ ...c, probability: 1 })),
      cleared: 0,
      unjudged: 0,
    }),
  };
});

import { typesafeCmd } from '../src/subcommands/handlers/typesafe.js';

let root: string;
let repo: string;
const saved = process.env['GIT_CONFIG_GLOBAL'];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-conventions-diff-'));
  repo = path.join(root, 'repo');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(path.join(repo, '.wrongstack'), { recursive: true });
  const cfg = path.join(root, 'global.gitconfig');
  await fs.writeFile(cfg, '[diff]\n\tmnemonicPrefix = true\n');
  process.env['GIT_CONFIG_GLOBAL'] = cfg;
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const git = (...args: string[]) => spawnSync('git', ['-C', repo, ...args], { env });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  await fs.writeFile(path.join(repo, 'src', 'x.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  await fs.writeFile(
    path.join(repo, 'src', 'x.ts'),
    "export const a = 1;\nexport const flagged = 'MARKER';\n",
  );
  await fs.writeFile(
    path.join(repo, '.wrongstack', 'semantic-lint.json'),
    JSON.stringify([{ id: 'src-marker', pattern: 'MARKER', files: '^src/', question: 'x?' }]),
  );
});

afterEach(async () => {
  if (saved === undefined) delete process.env['GIT_CONFIG_GLOBAL'];
  else process.env['GIT_CONFIG_GLOBAL'] = saved;
  await fs.rm(root, { recursive: true, force: true });
});

describe('wstack typesafe lint-conventions diff parsing', () => {
  it('names repo paths and matches anchored rules under diff.mnemonicPrefix', async () => {
    const lines: string[] = [];
    const deps = {
      config: { features: {} },
      renderer: {
        write: (t: string) => lines.push(t),
        writeError: vi.fn(),
        writeInfo: vi.fn(),
        writeWarning: vi.fn(),
      },
      projectRoot: repo,
      cwd: repo,
      flags: { json: true },
    } as never as Parameters<typeof typesafeCmd>[1];

    const code = await typesafeCmd(['lint-conventions'], deps);
    const report = JSON.parse(lines.join('')) as {
      findings: Array<{ ruleId: string; file: string }>;
    };

    expect(code).toBe(1);
    expect(report.findings.map((f) => `${f.ruleId}@${f.file}`)).toEqual(['src-marker@src/x.ts']);
  });
});
