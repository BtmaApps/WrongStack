import { describe, expect, it } from 'vitest';
import { fileTree, flattenFiles, lineDiff, parentPath, reviewText } from '../src/file-model';

describe('desktop file and review models', () => {
  it('preserves empty folders, normalized paths and reported metadata', () => {
    const tree = fileTree([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [{ name: 'a.ts', path: 'src\\a.ts', type: 'file', size: 42 }],
      },
      { name: 'empty', path: 'empty', type: 'directory' },
      null,
    ]);
    expect(flattenFiles(tree).map((n) => n.path)).toEqual(['src', 'src/a.ts', 'empty']);
    expect(tree[0]?.children[0]?.size).toBe(42);
    expect(parentPath('src/a.ts')).toBe('src');
  });
  it('keeps exact before/after lines, line numbers, additions, deletions and trailing newlines', () => {
    for (const [a, b] of [
      ['', ''],
      ['a', 'a\nb'],
      ['a\nb', 'a'],
      ['a\nb\nc', 'a\nx\nc'],
      ['x\n', 'x'],
      ['', 'hello\n'],
      ['alpha\nbeta', 'beta\nalpha'],
    ]) {
      const lines = lineDiff(a!, b!);
      expect(
        lines
          .filter((l) => l.kind !== 'add')
          .map((l) => l.text)
          .join('\n'),
      ).toBe(a);
      expect(
        lines
          .filter((l) => l.kind !== 'remove')
          .map((l) => l.text)
          .join('\n'),
      ).toBe(b);
      expect(lines.filter((l) => l.oldLine !== null).map((l) => l.oldLine)).toEqual(
        Array.from({ length: a ? a.split('\n').length : 0 }, (_, i) => i + 1),
      );
      expect(lines.filter((l) => l.newLine !== null).map((l) => l.newLine)).toEqual(
        Array.from({ length: b ? b.split('\n').length : 0 }, (_, i) => i + 1),
      );
    }
    expect(lineDiff('a\nb\nc', 'a\nx\nc').map((l) => l.kind)).toEqual([
      'same',
      'remove',
      'add',
      'same',
    ]);
  });
  it('bounds a large rewrite and keeps review comments attached to their actual file and line', () => {
    const a = Array.from({ length: 1300 }, (_, i) => `before${i}`).join('\n'),
      b = Array.from({ length: 1300 }, (_, i) => `after${i}`).join('\n');
    const diff = lineDiff(a, b);
    expect(
      diff
        .filter((l) => l.kind !== 'add')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(a);
    expect(
      diff
        .filter((l) => l.kind !== 'remove')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(b);
    expect(reviewText([{ path: 'src/app.ts', line: 12, text: 'Handle the empty case.' }])).toBe(
      'src/app.ts:12\nHandle the empty case.',
    );
  });
});
