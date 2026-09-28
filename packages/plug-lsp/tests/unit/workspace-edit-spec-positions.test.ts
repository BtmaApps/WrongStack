/**
 * Regression: applyTextEdits diverged from LSP TextEdit/Position semantics in
 * ways that corrupt files written by applyWorkspaceEdit:
 *  - same-position inserts came out in REVERSE array order (edits were applied
 *    from the end backwards), though the spec says array order decides;
 *  - a character past the line length was not clamped, so an over-long
 *    whole-line replacement ran through the newline and deleted the rest of
 *    the file;
 *  - a line past the end resolved to the START of the last line, so an
 *    end-of-file append to a file without a trailing newline landed mid-line.
 */
import { describe, expect, it } from 'vitest';
import { applyTextEdits } from '../../src/tools/workspace-edit.js';

const at = (line: number, character: number) => ({ line, character });
const edit = (sl: number, sc: number, el: number, ec: number, newText: string) => ({
  range: { start: at(sl, sc), end: at(el, ec) },
  newText,
});

describe('applyTextEdits LSP position semantics', () => {
  it('keeps array order for inserts at the same position', () => {
    expect(
      applyTextEdits('code();\n', [
        edit(0, 0, 0, 0, "import a from 'a';\n"),
        edit(0, 0, 0, 0, "import b from 'b';\n"),
      ]),
    ).toBe("import a from 'a';\nimport b from 'b';\ncode();\n");
    expect(applyTextEdits('abc', [edit(0, 0, 0, 0, 'X'), edit(0, 0, 0, 1, 'Y')])).toBe('XYbc');
  });

  it('clamps a character past the line length to the line end', () => {
    expect(
      applyTextEdits('const a = 1;\nconst b = 2;\n', [edit(0, 0, 0, 1000, 'let a = 1;')]),
    ).toBe('let a = 1;\nconst b = 2;\n');
    expect(applyTextEdits('aaa\r\nb\r\n', [edit(0, 0, 0, 99, 'X')])).toBe('X\r\nb\r\n');
  });

  it('treats a line past the end as the end of the document', () => {
    expect(applyTextEdits('a\nb', [edit(2, 0, 2, 0, '\nc')])).toBe('a\nb\nc');
  });
});
