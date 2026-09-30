import { describe, expect, it } from 'vitest';
import { parseGeneric } from '../src/codebase-index/generic-parser.js';

// schema.ts declares `col` 0-based; the TS/JSON/YAML parsers all emit
// 0-based. Guards the lineColAt off-by-one (round 7).
describe('generic-parser column base', () => {
  it('reports col 0 for a symbol at line start (first line)', () => {
    const res = parseGeneric({ file: 'a.py', content: 'def foo():\n    pass', lang: 'py' });
    const foo = res.symbols.find((s) => s.name === 'foo');
    expect(foo).toBeDefined();
    expect(foo?.line).toBe(1);
    expect(foo?.col).toBe(0);
  });

  it('reports col 0 for a symbol at line start (later line)', () => {
    const res = parseGeneric({
      file: 'a.py',
      content: 'x = 1\ndef bar():\n    pass',
      lang: 'py',
    });
    const bar = res.symbols.find((s) => s.name === 'bar');
    expect(bar).toBeDefined();
    expect(bar?.line).toBe(2);
    expect(bar?.col).toBe(0);
  });

  it('reports the match offset for an indented symbol', () => {
    const res = parseGeneric({
      file: 'a.py',
      content: 'class A:\n    def meth(self):\n        pass',
      lang: 'py',
    });
    const cls = res.symbols.find((s) => s.name === 'A');
    expect(cls).toMatchObject({ line: 1, col: 0 });
  });

  // `^\s*` under /m let the indent group span the preceding blank line, so the
  // match (and the reported line) started one line too early.
  it('reports the declaration line, not the blank line before it (ruby, css)', () => {
    const ruby = (content: string, name: string) =>
      parseGeneric({ file: 'a.rb', content, lang: 'ruby' }).symbols.find((s) => s.name === name);
    expect(ruby('class Foo\n\n  def bar\n  end\nend\n', 'bar')).toMatchObject({ line: 3 });
    expect(ruby('module M\n\nclass Foo\nend\nend\n', 'Foo')).toMatchObject({ line: 3 });
    expect(ruby('x = 1\n\nmodule Deep\nend\n', 'Deep')).toMatchObject({ line: 3 });
    // Control: without a blank line the line was already right.
    expect(ruby('class Foo\n  def bar\n  end\nend\n', 'bar')).toMatchObject({ line: 2 });

    const css = parseGeneric({ file: 'a.css', content: '.a { }\n\n.b { }\n', lang: 'css' });
    expect(css.symbols.find((s) => s.name === '.b')).toMatchObject({ line: 3 });
  });
});
