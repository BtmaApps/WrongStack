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
