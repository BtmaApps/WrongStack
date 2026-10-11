import { describe, expect, it } from 'vitest';
import { completedToolReceipt } from '../../src/coordination/agent-status-helpers.js';
import { compactDiff } from '../../src/utils/tool-output-renderers.js';
import { countUnifiedDiffLines } from '../../src/utils/unified-diff-count.js';

const SEPARATOR_PATCH = [
  '--- a/docs/a.md',
  '+++ b/docs/a.md',
  '@@ -1,2 +1,1 @@',
  '----',
  '-title: old',
  '+title: new',
].join('\n');

describe('diff consumers count separator lines', () => {
  it('an agent tool receipt counts a removed --- line', () => {
    const receipt = completedToolReceipt({ name: 'patch', input: { patch: SEPARATOR_PATCH } });
    expect(receipt).toMatchObject({ addedLines: 1, removedLines: 2 });
  });

  it('the compacted diff summary counts it too', () => {
    const big = `${SEPARATOR_PATCH}\n${Array.from({ length: 300 }, (_, i) => ` ctx ${i}`).join('\n')}`;
    expect(compactDiff(big)).toContain('removed=2');
  });
});

describe('countUnifiedDiffLines', () => {
  it('counts content lines that begin with --- or +++ and skips only file headers', () => {
    const diff = [
      'diff --git a/docs/a.md b/docs/a.md',
      '--- a/docs/a.md',
      '+++ b/docs/a.md',
      '@@ -1,4 +1,3 @@',
      '----',
      '-title: old',
      '--- legacy SQL comment',
      '+++count;',
      ' body',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -1 +1 @@',
      '-x',
      '+y',
    ].join('\n');
    expect(countUnifiedDiffLines(diff)).toEqual({ added: 2, removed: 4 });
  });

  it('ignores a format-patch preamble before the first hunk', () => {
    const patch = [
      'Subject: [PATCH] fix',
      '---',
      ' a.ts | 2 +-',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n');
    expect(countUnifiedDiffLines(patch)).toEqual({ added: 1, removed: 1 });
  });
});

// `files=N` is a count of FILES, and `git diff` names each file twice
// (`diff --git a/x b/x` and `--- a/x`). Counting the two spellings as two
// entries reported 2 files for a 1-file diff and 2N for an N-file diff.
describe('compactDiff counts files, not file headers', () => {
  /** `files=N` out of the emitted summary header. */
  const files = (diff: string): string | undefined =>
    /diff_summary \([^)]*\bfiles=(\d+)/.exec(compactDiff(diff))?.[1];

  /** Padding past DIFF_INLINE_LINE_LIMIT so compactDiff actually compacts. */
  const pad = (): string[] => Array.from({ length: 300 }, (_, i) => ` ctx line ${i}`);

  it('reports one file for a single-file git diff', () => {
    const diff = [
      'diff --git a/src/only.ts b/src/only.ts',
      'index 1111111..2222222 100644',
      '--- a/src/only.ts',
      '+++ b/src/only.ts',
      '@@ -1,3 +1,3 @@',
      '-const before = 1;',
      '+const after = 2;',
      ...pad(),
    ].join('\n');
    expect(files(diff)).toBe('1');
  });

  it('reports one file per file across a multi-file git diff', () => {
    const diff = [
      'diff --git a/src/one.ts b/src/one.ts',
      '--- a/src/one.ts',
      '+++ b/src/one.ts',
      '@@ -1,2 +1,2 @@',
      '-a',
      '+b',
      ...pad(),
      'diff --git a/src/two.ts b/src/two.ts',
      '--- a/src/two.ts',
      '+++ b/src/two.ts',
      '@@ -1,2 +1,2 @@',
      '-c',
      '+d',
    ].join('\n');
    expect(files(diff)).toBe('2');
  });

  // Control: a diff whose only header is the `--- `/`+++ ` pair (no
  // `diff --git` line) was already counted correctly and must stay so.
  it('reports one file for a ---/+++ only diff', () => {
    const diff = [
      '--- src/only.ts',
      '+++ src/only.ts',
      '@@ -1,3 +1,3 @@',
      '-const before = 1;',
      '+const after = 2;',
      ...pad(),
    ].join('\n');
    expect(files(diff)).toBe('1');
  });

  // Boundary: removed content that merely starts with `--- ` (a deleted SQL
  // or Lua `-- comment`) is hunk content, not a file header.
  it('does not count removed "--- comment" content as a file', () => {
    const diff = [
      'diff --git a/src/query.sql b/src/query.sql',
      '--- a/src/query.sql',
      '+++ b/src/query.sql',
      '@@ -1,4 +1,3 @@',
      '--- legacy SQL comment',
      '+SELECT 1;',
      ...pad(),
    ].join('\n');
    expect(files(diff)).toBe('1');
  });
});
