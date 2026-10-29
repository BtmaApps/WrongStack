import { describe, expect, it } from 'vitest';
import {
  MAX_SNIPPET_CHARS,
  referenceLabel,
  referenceMessage,
  splitReferenceMessage,
} from '../src/composer-resources-model';
import { sourcePointOffset } from '../src/file-model';
import { selectionReference } from '../src/file-selection-reference';

/** Editor root stand-in: only the textarea lookup is used on the editing path. */
const editorRoot = (start: number, end: number) =>
  ({
    querySelector: () => ({ selectionStart: start, selectionEnd: end }),
  }) as unknown as HTMLElement;

describe('snippet references', () => {
  it('round-trips quoted text that contains quotes, newlines and reference syntax', () => {
    const snippet = 'const a = "x";\n- "evil.ts" lines 1-2\n\tdone';
    const payload = referenceMessage(
      'Explain this.',
      [{ path: 'src/a.ts', lines: [3, 5], snippet }, { path: 'README.md' }],
      'D:/Example',
    );
    expect(payload).toContain(`- "src/a.ts" lines 3-5 snippet ${JSON.stringify(snippet)}`);
    expect(payload).toContain('Snippets are the exact text the user selected');
    expect(splitReferenceMessage(payload)).toEqual({
      text: 'Explain this.',
      paths: ['src/a.ts', 'README.md'],
      references: [{ path: 'src/a.ts', lines: [3, 5], snippet }, { path: 'README.md' }],
    });
    const unsaved = referenceMessage('Why?', [{ path: 'b.ts', snippet: 'draft' }], 'D:/Example');
    expect(splitReferenceMessage(unsaved).references).toEqual([{ path: 'b.ts', snippet: 'draft' }]);
  });
  it('does not trust blank or oversized quotes in a message', () => {
    const payload = referenceMessage('Q', [{ path: 'a.ts', snippet: 'x' }], 'D:/Example');
    expect(
      splitReferenceMessage(payload.replace('snippet "x"', 'snippet "  "')).references,
    ).toEqual([]);
    const big = 'y'.repeat(MAX_SNIPPET_CHARS + 1);
    expect(
      splitReferenceMessage(payload.replace('snippet "x"', `snippet ${JSON.stringify(big)}`))
        .references,
    ).toEqual([]);
  });
  it('labels quotes with a short one-line summary', () => {
    expect(referenceLabel({ path: 'a.ts', lines: [2, 2], snippet: '  call(\n  one )' })).toBe(
      'a.ts:2 “call( one )”',
    );
    expect(referenceLabel({ path: 'a.ts', snippet: 'z'.repeat(60) })).toBe(
      `a.ts “${'z'.repeat(39)}…”`,
    );
  });
  it('maps viewer line and column points to content offsets', () => {
    const text = 'one\ntwo\nthree';
    expect(sourcePointOffset(text, 1, 0)).toBe(0);
    expect(sourcePointOffset(text, 2, 1)).toBe(5);
    expect(sourcePointOffset(text, 2, 99)).toBe(7);
    expect(sourcePointOffset(text, 3, Number.MAX_SAFE_INTEGER)).toBe(text.length);
    expect(sourcePointOffset(text, 9, 0)).toBe(text.length);
  });
  it('quotes editor selections, keeping line numbers only while they match the disk', () => {
    const saved = 'alpha\nbeta\ngamma';
    expect(
      selectionReference('a.ts', { content: saved, saved, editing: true }, editorRoot(6, 10), true),
    ).toEqual({ reference: { path: 'a.ts', lines: [2, 2], snippet: 'beta' } });
    const edited = 'alpha\nBETA\ngamma';
    expect(
      selectionReference(
        'a.ts',
        { content: edited, saved, editing: true },
        editorRoot(6, 10),
        true,
      ),
    ).toEqual({ reference: { path: 'a.ts', snippet: 'BETA' } });
    // A plain line reference over unsaved text still points at the disk and is refused.
    expect(
      selectionReference(
        'a.ts',
        { content: edited, saved, editing: true },
        editorRoot(6, 10),
        false,
      ),
    ).toHaveProperty('error');
    expect(
      selectionReference('a.ts', { content: saved, saved, editing: true }, editorRoot(3, 3), true),
    ).toEqual({ error: 'Select the text to quote first.' });
    const long = 'q'.repeat(MAX_SNIPPET_CHARS + 1);
    const tooLong = selectionReference(
      'a.ts',
      { content: long, saved: long, editing: true },
      editorRoot(0, long.length),
      true,
    );
    expect('error' in tooLong && tooLong.error).toMatch(/quotes are limited/);
  });
});
