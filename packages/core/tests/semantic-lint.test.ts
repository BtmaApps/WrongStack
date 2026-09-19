/**
 * Semantic lint: regex candidates from ADDED diff lines only, with new-side
 * line numbers, and only judged violations reported.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_SEMANTIC_LINT_RULES,
  findSemanticLintCandidates,
  judgeSemanticLintCandidates,
  parseSemanticLintRules,
  type TypeSafeJudge,
} from '../src/typesafe/index.js';

const DIFF = [
  'diff --git a/src/tool.ts b/src/tool.ts',
  '--- a/src/tool.ts',
  '+++ b/src/tool.ts',
  '@@ -10,3 +10,5 @@ export function tool() {',
  '   async execute(input) {',
  "-    return { status: 'error', message: 'old' };",
  "+    if (!input.path) return { status: 'error', message: 'missing path' };",
  "+    const child = spawn('git', ['status'], { windowsHide: true });",
  '     return run(input);',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,1 +1,2 @@',
  ' # Title',
  "+Return { status: 'error' } from tools.",
].join('\n');

describe('findSemanticLintCandidates', () => {
  it('finds added-line hits in source files with new-side line numbers', () => {
    const candidates = findSemanticLintCandidates(DIFF, BUILT_IN_SEMANTIC_LINT_RULES);
    expect(candidates.map((c) => [c.ruleId, c.file, c.line])).toEqual([
      ['tool-error-payload', 'src/tool.ts', 11],
      ['spawn-without-windows-hide', 'src/tool.ts', 12],
    ]);
    expect(candidates[0]?.snippet).toContain('async execute(input)');
  });
});

describe('findSemanticLintCandidates — multi-line calls', () => {
  it('extends the snippet to where the call closes, past the fixed context', () => {
    // First live run: `windowsHide` sat 8 lines below `execFile(`, outside the
    // 6-line window, and Jev (correctly, given what it saw) flagged it.
    const diff = [
      'diff --git a/src/run.ts b/src/run.ts',
      '--- a/src/run.ts',
      '+++ b/src/run.ts',
      '@@ -1,0 +1,14 @@',
      '+export function run(cwd: string) {',
      '+  execFile(',
      "+    'git',",
      '+    args,',
      '+    {',
      '+      cwd,',
      '+      env: buildChildEnv(),',
      "+      encoding: 'utf8',",
      '+      timeout: 30_000,',
      '+      windowsHide: true,',
      '+    },',
      '+    done,',
      '+  );',
      '+}',
    ].join('\n');
    const [candidate] = findSemanticLintCandidates(diff, BUILT_IN_SEMANTIC_LINT_RULES);
    expect(candidate?.snippet).toContain('windowsHide: true');
  });
});

describe('judgeSemanticLintCandidates', () => {
  const judge = (nouls: number[] | Error): TypeSafeJudge => ({
    feature: 'semanticLint',
    model: 'jev-test',
    client: {
      systemOne: vi.fn(async () => {
        if (nouls instanceof Error) throw nouls;
        return {
          answers: Object.fromEntries(nouls.map((noul, i) => [`c${i}`, { type: 'noul', noul }])),
          usage: { inputTokens: 1, outputTokens: 0 },
        } as never;
      }),
    },
  });

  it('reports only judged violations', async () => {
    const candidates = findSemanticLintCandidates(DIFF, BUILT_IN_SEMANTIC_LINT_RULES);
    const result = await judgeSemanticLintCandidates(
      judge([0.95]),
      BUILT_IN_SEMANTIC_LINT_RULES,
      candidates,
    );
    // Each rule is its own request; the stub answers c0 for both.
    expect(result.findings.map((f) => f.ruleId)).toEqual([
      'tool-error-payload',
      'spawn-without-windows-hide',
    ]);
  });

  it('counts candidates as unjudged when the host fails', async () => {
    const candidates = findSemanticLintCandidates(DIFF, BUILT_IN_SEMANTIC_LINT_RULES);
    const result = await judgeSemanticLintCandidates(
      judge(new Error('resting')),
      BUILT_IN_SEMANTIC_LINT_RULES,
      candidates,
    );
    expect(result).toMatchObject({ findings: [], unjudged: 2 });
  });
});

describe('parseSemanticLintRules', () => {
  it('keeps valid rules and names invalid ones', () => {
    const { rules, errors } = parseSemanticLintRules([
      { id: 'ok', pattern: 'TODO', question: 'Is this TODO missing an issue link?' },
      { id: 'bad-regex', pattern: '(', question: 'x?' },
      { id: 'no-question', pattern: 'x' },
    ]);
    expect(rules.map((r) => r.id)).toEqual(['ok']);
    expect(errors).toHaveLength(2);
  });
});
