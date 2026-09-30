import { describe, expect, it } from 'vitest';
import { maskRustNonCode, parseSymbols } from '../src/codebase-index/rs-parser.js';

const parse = async (content: string) =>
  (await parseSymbols({ file: '/p/lib.rs', content, lang: 'rs' })).symbols;
const names = async (content: string) => (await parse(content)).map((s) => `${s.kind}:${s.name}`);

describe('rs-parser — declaration accuracy', () => {
  it('indexes generic functions', async () => {
    expect(await names('pub fn parse<T: AsRef<str>>(input: T) -> u8 { 0 }\n')).toContain(
      'function:parse',
    );
  });

  it("does not index the lifetime in `&'static str` as a static", async () => {
    const out = await names('pub fn name(&self) -> &\'static str { "x" }\n');
    expect(out.filter((n) => n.startsWith('static:'))).toEqual([]);
  });

  it('does not index `const fn` as a const named fn', async () => {
    const out = await names('pub const fn new() -> Self { Self }\npub const LIMIT: usize = 4;\n');
    expect(out).toContain('function:new');
    expect(out).toContain('const:LIMIT');
    expect(out).not.toContain('const:fn');
  });

  it('ignores keywords inside comments and strings', async () => {
    const out = await names(
      [
        '// this fn ghost() is not real',
        '/* struct Phantom { /* nested */ } */',
        'fn real() { let s = "fn fake() and struct Nope"; let c = \'"\'; }',
        'struct Kept;',
      ].join('\n'),
    );
    expect(out).toEqual(expect.arrayContaining(['function:real', 'struct:Kept']));
    expect(out.join(' ')).not.toMatch(/ghost|Phantom|fake|Nope/);
  });

  it('indexes impl blocks in item position only', async () => {
    const out = await names(
      'impl<T: Into<String>> Wrapper<T> {}\nfn iter() -> impl Iterator<Item = u8> { todo!() }\n',
    );
    expect(out).toContain('impl:Wrapper');
    expect(out).not.toContain('impl:Iterator');
  });

  it('reads /// doc comments above attributes', async () => {
    const syms = await parse('/// Opens the store.\n#[inline]\npub fn open() {}\n');
    expect(syms.find((s) => s.name === 'open')?.docComment).toBe('Opens the store.');
  });

  it('reports the column of the name, not of the indentation', async () => {
    const syms = await parse('    impl Thing {}\n');
    expect(syms.find((s) => s.name === 'Thing')?.col).toBe(9);
  });
});

describe('maskRustNonCode', () => {
  it('preserves length and newlines', () => {
    const src = 'a // c\n"s\\"t" r#"raw"# \'x\' \'a /* n /* m */ */ b';
    const masked = maskRustNonCode(src);
    expect(masked).toHaveLength(src.length);
    expect(masked.split('\n')).toHaveLength(src.split('\n').length);
    expect(masked).not.toMatch(/raw|c\n/);
  });

  // `cr"…"` is a raw C string (Rust 1.77): `\` is literal, so `cr"C:\"` closes
  // at the second quote. Treated as an escaping string, it never closed and
  // every declaration after it was masked away.
  it('treats cr"…" raw C strings as raw, like r"…" and br"…"', async () => {
    const after = async (literal: string) =>
      (await names(`const P: &CStr = ${literal};\nfn after() {}\nstruct Next;\n`)).filter(
        (n) => n === 'function:after' || n === 'struct:Next',
      );
    expect(await after('cr"C:\\"')).toEqual(['function:after', 'struct:Next']);
    expect(await after('cr#"a\\"#')).toEqual(['function:after', 'struct:Next']);
    // Controls: the raw forms that already worked, and a non-raw C string.
    expect(await after('r"C:\\"')).toEqual(['function:after', 'struct:Next']);
    expect(await after('br"C:\\"')).toEqual(['function:after', 'struct:Next']);
    expect(await after('c"ok"')).toEqual(['function:after', 'struct:Next']);
    // An identifier ending in `c` before `r"` is not a raw-string prefix.
    expect(maskRustNonCode('abcr"x"')).toBe('abcr" "');
  });
});
