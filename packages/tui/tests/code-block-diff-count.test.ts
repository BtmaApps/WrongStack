/**
 * Regression: the TUI diff counter must follow core's canonical
 * countUnifiedDiffLines rule — a `--- `/`+++ ` pair is a file header only
 * OUTSIDE a hunk body; the hunk's declared line counts tell that pair apart
 * from adjacent content lines (`--- x` followed by `+++ y`, e.g. editing SQL
 * comments), which must both count. The counts feed the multi-file diff
 * footer's `… +N -M hidden` rollup for files omitted by the render caps.
 */
import { describe, expect, it } from 'vitest';
import { countUnifiedDiffChanges } from '../src/components/history/code-block-diff-helpers.js';
import { extractMultiFileDiffs } from '../src/components/history/diff-model.js';

describe('countUnifiedDiffChanges', () => {
  it('counts adjacent ---/+++ content lines inside an active hunk body', () => {
    // Source `-- old comment` (SQL) → diff line `--- old comment`;
    // source `++ new comment` → diff line `+++ new comment`.
    const diff = ['@@ -1,2 +1,2 @@', '--- old comment', '+++ new comment', ''].join('\n');
    expect(countUnifiedDiffChanges(diff)).toEqual({ added: 1, removed: 1 });
  });

  it('skips the patch(1) header pair that precedes the first hunk', () => {
    const diff = ['--- a/f.txt', '+++ b/f.txt', '@@ -1,1 +1,1 @@', '-a', '+b', ''].join('\n');
    expect(countUnifiedDiffChanges(diff)).toEqual({ added: 1, removed: 1 });
  });

  it('counts a hunkless +/- snippet from the first line', () => {
    expect(countUnifiedDiffChanges('-a\n+b')).toEqual({ added: 1, removed: 1 });
  });

  it('counts +/- lines inside a plain hunk', () => {
    expect(countUnifiedDiffChanges('@@ -1,2 +1,2 @@\n-old\n+new\n')).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it('skips a header pair between two fully consumed hunks', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      ' c',
      '--- a/f2.txt',
      '+++ b/f2.txt',
      '@@ -1,1 +1,1 @@',
      '-p',
      '+q',
      '',
    ].join('\n');
    expect(countUnifiedDiffChanges(diff)).toEqual({ added: 1, removed: 1 });
  });

  it('counts a --- content line whose next line is not +++ (no header pair)', () => {
    const diff = ['@@ -1,2 +1,2 @@', '--- old comment', '- other', '+ new', ''].join('\n');
    expect(countUnifiedDiffChanges(diff)).toEqual({ added: 1, removed: 2 });
  });
});

describe('extractMultiFileDiffs omitted rollup', () => {
  it('computes omitted-file stats through countUnifiedDiffChanges', () => {
    // 20 rendered files + 1 omitted file carrying the in-hunk content pair:
    // the footer reports `… +N -M hidden across 1 file`, so the counts of
    // the omitted file must not be dropped.
    const pairDiff = '@@ -1,2 +1,2 @@\n--- old comment\n+++ new comment';
    const plainDiff = '@@ -1,2 +1,2 @@\n-a\n+b';
    const results = [
      ...Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.txt`, diff: plainDiff })),
      { path: 'pair.txt', diff: pairDiff },
    ];
    const previews = extractMultiFileDiffs('replace', JSON.stringify({ results }), undefined);
    expect(previews?.length).toBe(20);
    expect(previews?.omitted).toEqual({ fileCount: 1, added: 1, removed: 1 });
  });
});
