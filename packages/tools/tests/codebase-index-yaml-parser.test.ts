import { describe, expect, it } from 'vitest';
import { parseSymbols } from '../src/codebase-index/yaml-parser.js';

const parse = (content: string, file = 'config.yaml') =>
  parseSymbols({ file, content, lang: 'yaml' });
const names = (content: string, file = 'config.yaml') =>
  parse(content, file).symbols.map((s) => s.name);
const find = (content: string, name: string, file = 'config.yaml') =>
  parse(content, file).symbols.find((s) => s.name === name);

describe('yaml-parser parseSymbols', () => {
  it('extracts anchors (&) and aliases (*) as const symbols', () => {
    const content = ['base: &base', '  a: 1', 'use: *base'].join('\n');
    expect(find(content, 'base')).toBeDefined();
    // anchor + alias both surface as const-kind symbols
    const consts = parse(content).symbols.filter((s) => s.kind === 'const');
    expect(consts.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores &/* inside scalar values (URL query strings, mid-token stars)', () => {
    const content = ['endpoint: https://example.com/?a=1&b=2', 'note: a*b'].join('\n');
    const consts = parse(content).symbols.filter((s) => s.kind === 'const');
    expect(consts.map((s) => s.name)).not.toContain('b');
    expect(find(content, 'endpoint')).toBeDefined();
  });

  it('classifies top-level keys as property (value spans the whole line)', () => {
    const content = ['name: hello', 'parent:', '  child: 1'].join('\n');
    expect(find(content, 'name')?.kind).toBe('property');
    expect(find(content, 'parent')?.kind).toBe('property');
  });

  it('marks top-level scalar values as literal with a clean signature', () => {
    const content = ['count: 42', 'enabled: true'].join('\n');
    expect(find(content, 'count')).toMatchObject({ kind: 'literal', signature: 'count: 42' });
    expect(find(content, 'enabled')).toMatchObject({
      kind: 'literal',
      signature: 'enabled: true',
    });
  });

  it('marks list-item scalar values as literal (number, boolean, quoted)', () => {
    // List items pass the post-colon value to the scalar detector.
    const content = [
      'items:',
      '- num: 42',
      '- flag: true',
      "- single: 'x'",
      '- double: "y"',
      '- word: hello',
      '- empty:',
    ].join('\n');
    expect(find(content, 'num')?.kind).toBe('literal'); // number
    expect(find(content, 'flag')?.kind).toBe('literal'); // boolean
    expect(find(content, 'single')?.kind).toBe('literal'); // single-quoted
    expect(find(content, 'double')?.kind).toBe('literal'); // double-quoted
    expect(find(content, 'word')?.kind).toBe('property'); // bare word → not scalar
    expect(find(content, 'empty')?.kind).toBe('property'); // no value → not scalar
  });

  it('extracts list item keys (- key: value)', () => {
    const content = ['items:', '- key: a', '- name: b'].join('\n');
    // Existence alone passed a parser that put the symbol on the wrong line or
    // under the wrong kind — the line is what code navigation jumps to.
    expect(find(content, 'key')).toMatchObject({ kind: 'property', line: 2 });
    expect(find(content, 'name')).toMatchObject({ kind: 'property', line: 3 });
  });

  it('extracts indented list-item keys under a parent key', () => {
    const content = ['items:', '  - num: 42', '  - flag: true'].join('\n');
    expect(find(content, 'num')).toMatchObject({ kind: 'literal', line: 2 });
    expect(find(content, 'flag')).toMatchObject({ kind: 'literal', line: 3 });
  });

  it('reports the key line, not the preceding blank line, after an empty line', () => {
    // A `\s*` indent group can span newlines under /m, so a match began on the
    // blank line: the symbol landed one line early and the newline inflated
    // the indent past the >12 skip threshold, dropping deep keys entirely.
    const deep = ' '.repeat(12);
    expect(find('a: 1\n\n  b: 2\n', 'b')).toMatchObject({ line: 3 });
    expect(find('items:\n\n  - c: 3\n', 'c')).toMatchObject({ line: 3 });
    expect(find('a: 1\n\n  run: |\n    echo hi\n', 'run')).toMatchObject({ line: 3 });
    expect(find(`a:\n\n${deep}deep: 1\n`, 'deep')).toMatchObject({ line: 3 });
    // Control: the same deep key without a blank line was always found.
    expect(find(`a:\n${deep}deep: 1\n`, 'deep')).toMatchObject({ line: 2 });
  });

  it('reports the 0-based column of the key itself, not of the line start', () => {
    // col was `match.index - lineStart`, and every key regex matches from `^`,
    // so every key — however deeply indented — reported col 0.
    expect(find('top: 1\n', 'top')).toMatchObject({ line: 1, col: 0 });
    expect(find('a:\n  b: 2\n', 'b')).toMatchObject({ line: 2, col: 2 });
    expect(find('a:\n\tb: 2\n', 'b')).toMatchObject({ line: 2, col: 1 });
    expect(find('items:\n  - c: 3\n', 'c')).toMatchObject({ line: 2, col: 4 });
    expect(find('items:\n-   d: 4\n', 'd')).toMatchObject({ line: 2, col: 4 });
    expect(find('a:\n    run: |\n      echo hi\n', 'run')).toMatchObject({ line: 2, col: 4 });
    expect(find('a:\n\n  b: 2\n', 'b')).toMatchObject({ line: 3, col: 2 });
    // Anchors already matched at the sigil; keep that column.
    expect(find('a:\n  x: &base 1\n', 'base')).toMatchObject({ line: 2, col: 5 });
  });

  it('emits each block-scalar header exactly once (section 2 defers to section 4)', () => {
    const content = ['literal: |', '  multi', '  line', 'folded: >', '  text'].join('\n');
    const res = parse(content);
    expect(res.symbols.filter((s) => s.name === 'literal').length).toBe(1);
    expect(res.symbols.filter((s) => s.name === 'folded').length).toBe(1);
    expect(find(content, 'literal')?.signature).toBe('literal: | ...');
    expect(find(content, 'folded')?.signature).toBe('folded: | ...');
  });

  it('skips document markers (--- and ...)', () => {
    const content = ['---: x', '...: y', 'real: 1'].join('\n');
    expect(names(content)).not.toContain('---');
    expect(names(content)).not.toContain('...');
    expect(find(content, 'real')).toBeDefined();
  });

  it('skips lines whose trimmed content starts with | & or >', () => {
    const content = ['>weird: value', 'real: 1'].join('\n');
    // `>weird` line is skipped by the block-scalar-indicator guard
    expect(find(content, '>weird')).toBeUndefined();
  });

  it('skips deeply-indented keys (indent > 12)', () => {
    const deep = `${' '.repeat(13)}buried: 1`;
    const content = ['top: 1', deep].join('\n');
    expect(find(content, 'buried')).toBeUndefined();
    expect(find(content, 'top')).toBeDefined();
  });

  it('handles a final line with no trailing newline', () => {
    const res = parse('only: value'); // no \n at all
    expect(res.symbols.find((s) => s.name === 'only')).toBeDefined();
  });

  it('produces a stable FileSymbols shape', () => {
    const res = parse('a: 1');
    expect(res.file).toBe('config.yaml');
    expect(res.lang).toBe('yaml');
    expect(typeof res.mtimeMs).toBe('number');
  });
});
