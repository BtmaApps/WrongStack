import { describe, expect, it } from 'vitest';
import {
  aggregateFileEdits,
  countDiffLines,
  extractFileEditMeta,
} from '../src/lib/timeline-model.js';
import type { ToolCallInfo } from '../src/types.js';

const SAGE_BLOCK = [
  '--- SAGE: related project knowledge (Memory Injector) ---',
  '- [fact] <memory id="mem-1">test memory content here</memory> [tags=test]',
  '- [decision][high] <memory id="mem-2">another memory</memory> (@wrongstack/tui) [relation=about_package]',
].join('\n');

function toolCall(name: string, output: string): ToolCallInfo {
  return { id: 't1', name, input: {}, status: 'done', output };
}

describe('extractFileEditMeta — SAGE injector stripping', () => {
  it('strips a trailing SAGE block from serialized-format diff output', () => {
    const out =
      'edit (path=src/file.ts replacements=1 matched_by=exact)\n@@ -1,3 +1,3 @@\n old\n+new\n-old';
    const meta = extractFileEditMeta(toolCall('edit', `${out}\n\n${SAGE_BLOCK}`));
    expect(meta?.diff).toBeDefined();
    expect(meta?.diff).not.toContain('SAGE');
    expect(meta?.diff).not.toContain('Memory Injector');
    expect(meta?.diff).not.toContain('<memory id=');
    expect(meta?.diff).toContain('+new');
    expect(meta?.diff).toContain('-old');
  });

  it('strips a trailing SAGE block from JSON diff output', () => {
    const out = JSON.stringify({
      path: 'src/file.ts',
      replacements: 1,
      diff: '@@ -1,1 +1,1 @@\n-old\n+new',
    });
    const meta = extractFileEditMeta(toolCall('edit', `${out}\n\n${SAGE_BLOCK}`));
    expect(meta?.diff).toBeDefined();
    expect(meta?.diff).not.toContain('SAGE');
    expect(meta?.diff).not.toContain('Memory Injector');
  });

  it('leaves output untouched when there is no SAGE block', () => {
    const out =
      'edit (path=src/file.ts replacements=1 matched_by=exact)\n@@ -1,1 +1,1 @@\n-old\n+new';
    const meta = extractFileEditMeta(toolCall('edit', out));
    expect(meta?.diff).toContain('+new');
    expect(meta?.diff).not.toContain('SAGE');
  });

  it('handles the task-aware SAGE heading variant too', () => {
    const taskBlock = [
      '--- SAGE: task-aware project knowledge (Memory Injector) ---',
      '- [fact] <memory id="mem-3">task memory</memory>',
    ].join('\n');
    const out = 'write (path=src/new.ts bytes_written=42 created=true)\n@@ -0,0 +1,1 @@\n+hello';
    const meta = extractFileEditMeta(toolCall('write', `${out}\n\n${taskBlock}`));
    expect(meta?.diff).toContain('+hello');
    expect(meta?.diff).not.toContain('SAGE');
    expect(meta?.diff).not.toContain('<memory id=');
  });
});

describe('countDiffLines — header-shaped content inside hunks', () => {
  const MARKDOWN_EDIT_DIFF = [
    '@@ -1,3 +1,3 @@',
    ' keep',
    '--- rule one',
    '+++ rule two',
    ' tail',
  ].join('\n');

  it('counts adjacent header-shaped content inside a hunk', () => {
    // A removed `--- rule one` followed by an added `+++ rule two` INSIDE the
    // hunk body is content, not the file header — the same rule core's
    // countUnifiedDiffLines enforces (see unified-diff-count.test.ts).
    expect(countDiffLines(MARKDOWN_EDIT_DIFF)).toEqual({ added: 1, removed: 1 });
  });

  it('still skips the next file header after a hunk in a multi-file diff', () => {
    const diff = [
      '--- a/one.txt',
      '+++ b/one.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '--- a/two.txt',
      '+++ b/two.txt',
      '@@ -1 +1 @@',
      '-x',
      '+y',
    ].join('\n');
    expect(countDiffLines(diff)).toEqual({ added: 2, removed: 2 });
  });

  it('returns null for input without a hunk header', () => {
    expect(countDiffLines('--- a/f.md\n+++ b/f.md\n-not a hunk')).toBeNull();
  });

  it('feeds the replacements fallback the real added count', () => {
    const meta = extractFileEditMeta(
      toolCall('edit', `edit (path=notes.md)\n${MARKDOWN_EDIT_DIFF}`),
    );
    expect(meta).toEqual(expect.objectContaining({ path: 'notes.md', replacements: 1 }));
  });

  it('aggregates totals across edits including in-hunk content pairs', () => {
    const { totalAdded, totalRemoved } = aggregateFileEdits([
      toolCall('edit', `edit (path=notes.md)\n${MARKDOWN_EDIT_DIFF}`),
    ]);
    expect({ totalAdded, totalRemoved }).toEqual({ totalAdded: 1, totalRemoved: 1 });
  });
});
