import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  maskGoNonCode,
  parseSymbols as parseGo,
  parseGoWithoutToolchain,
} from '../src/codebase-index/go-parser.js';
import { runGoBatch, runPyBatch } from '../src/codebase-index/parser-batch.js';
import { parseSymbols as parsePy, resolvePythonBinary } from '../src/codebase-index/py-parser.js';
import type { Symbol as IndexSymbol } from '../src/codebase-index/schema.js';
import { __privateScriptPathsForTest } from '../src/codebase-index/toolchain-scripts.js';

const HAS_GO = spawnSync('go', ['version'], { windowsHide: true }).status === 0;

const SCHEMA_KINDS = new Set([
  'class',
  'interface',
  'enum',
  'type',
  'function',
  'method',
  'var',
  'const',
  'let',
  'property',
  'parameter',
  'namespace',
  'object',
  'literal',
  'schema',
  'struct',
  'trait',
  'impl',
  'static',
  'mod',
]);

const view = (symbols: readonly IndexSymbol[]) =>
  symbols.map((s) => ({
    kind: s.kind,
    name: s.name,
    line: s.line,
    col: s.col,
    scope: s.scope,
    signature: s.signature,
    doc: s.docComment,
  }));

const GO_SRC = [
  'package shapes',
  '',
  'type List[T any] struct{ items []T }',
  '',
  '// Push appends values.',
  'func (l *List[T]) Push(a, b T, rest ...T) {}',
  '',
  'func Map[T any](xs []T) []T { return xs }',
  '',
  'const (',
  '\tSmall = iota',
  '\tLarge',
  ')',
].join('\n');

describe.skipIf(!HAS_GO)('go toolchain parser', () => {
  it('single-file and batch paths produce identical symbols', { timeout: 120_000 }, async () => {
    const single = await parseGo({ file: 'shapes.go', content: GO_SRC, lang: 'go' });
    const batch = (await runGoBatch([{ file: 'shapes.go', content: GO_SRC, lang: 'go' }])).get(
      'shapes.go',
    );
    expect(batch).toBeDefined();
    // The batch program used to report 1-based columns.
    expect(view(batch?.symbols ?? [])).toEqual(view(single.symbols));
    expect(single.symbols.find((s) => s.name === 'Map')?.col).toBe(0);
  });

  it('scopes generic receivers and keeps complete signatures', { timeout: 120_000 }, async () => {
    const { symbols } = await parseGo({ file: 'shapes.go', content: GO_SRC, lang: 'go' });
    expect(symbols.find((s) => s.name === 'Push')).toMatchObject({
      kind: 'method',
      scope: 'shapes.List.Push',
      signature: 'func (l *List[T]) Push(a, b T, rest ...T)',
      docComment: 'Push appends values.',
    });
    expect(symbols.find((s) => s.name === 'Map')?.signature).toBe('func Map[T any](xs []T) []T');
    expect(symbols.find((s) => s.name === 'List')?.signature).toBe(
      'type List[T any] struct{ items []T }',
    );
  });

  it('ignores the go.mod of the directory wstack runs in', { timeout: 120_000 }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-hostile-gomod-'));
    await fs.writeFile(
      path.join(dir, 'go.mod'),
      'module hostile\n\ngo 1.99\n\ntoolchain go1.99.0\n',
    );
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const { symbols } = await parseGo({
        file: 'hello.go',
        content: 'package main\n\nfunc Hello[T any]() {}\n',
        lang: 'go',
      });
      // The native signature (no body) proves `go run` succeeded; the regex
      // fallback would have kept the raw line.
      expect(symbols.find((s) => s.name === 'Hello')?.signature).toBe('func Hello[T any]()');
    } finally {
      process.chdir(previous);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('go regex fallback', () => {
  it('survives delimiters in literals and indexes only top-level declarations', () => {
    const { symbols } = parseGoWithoutToolchain(
      '/p/tools.go',
      [
        'package tools',
        '',
        '// func ghost() {}',
        'const (',
        '\tOpen = "("',
        '\tClose, Other = ")", `}`',
        '\t_ = iota',
        ')',
        '',
        'type Box[T any] struct{ v T }',
        '',
        'func (b *Box[T]) Get() T {',
        '\tvar local = strings.Split("a(b", "(")',
        '\ttype inner struct{}',
        '\treturn b.v',
        '}',
        '',
        'func Map[T any](xs []T) []T { return xs }',
        'var x, y int',
      ].join('\n'),
    );
    expect(symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'const:Open',
      'const:Close',
      'const:Other',
      'type:Box',
      'method:Get',
      'function:Map',
      'var:x',
      'var:y',
    ]);
    expect(symbols.find((s) => s.name === 'Get')?.scope).toBe('tools.Box.Get');
  });

  it('still refuses genuinely unbalanced source', () => {
    expect(parseGoWithoutToolchain('/p/a.go', 'package main\nfunc {').symbols).toEqual([]);
  });

  it('masks without moving offsets', () => {
    const src = 'a := "x(" // c)\n/* { */ b := `\n}` + \'(\'';
    const masked = maskGoNonCode(src);
    expect(masked).toHaveLength(src.length);
    expect(masked.split('\n')).toHaveLength(src.split('\n').length);
    expect(masked).not.toMatch(/[(){}]/);
  });
});

const PY_FILE = 'C:\\repo\\pkg\\svc.pyw';
const PY_SRC = `\ufeff${[
  '# Türkçe yorum: ğüşıöç İŞ',
  'import os',
  'from typing import List as L',
  '',
  'class Svc:',
  '    """Service façade."""',
  '    @staticmethod',
  '    def make(): pass',
  '    @classmethod',
  '    def build(cls, *args, key=None, **kw): pass',
  '    @property',
  '    def size(self): return 1',
  '    async def run(self): pass',
  '',
  'async def main():',
  '    """Entry point."""',
  '',
  'değer, ŞEY = 1, 2',
].join('\n')}\n`;

describe('python toolchain parser', () => {
  it('emits schema kinds, no import symbols, and parses UTF-8 with a BOM', async (ctx) => {
    const bin = await resolvePythonBinary();
    if (!bin) return ctx.skip();

    const single = await parsePy({ file: PY_FILE, content: PY_SRC, lang: 'py' });
    expect(Object.fromEntries(single.symbols.map((s) => [s.name, s.kind]))).toEqual({
      Svc: 'class',
      make: 'method',
      build: 'method',
      size: 'property',
      run: 'method',
      main: 'function',
      değer: 'var',
      ŞEY: 'const',
    });
    expect(single.symbols.every((s) => SCHEMA_KINDS.has(s.kind))).toBe(true);
    expect(single.symbols.find((s) => s.name === 'build')?.signature).toBe(
      'def build(cls, *args, key, **kw)',
    );
    expect(single.symbols.find((s) => s.name === 'run')?.signature).toBe('async def run(self)');
    expect(single.symbols.find((s) => s.name === 'Svc')?.docComment).toBe('Service façade.');
    expect(single.symbols.find((s) => s.name === 'main')?.scope).toBe('svc.main');
    expect(single.refs?.some((r) => r.callType === 'import' && r.module === 'os')).toBe(true);

    const batch = (await runPyBatch([{ file: PY_FILE, content: PY_SRC, lang: 'py' }], bin)).get(
      PY_FILE,
    );
    expect(batch).toBeDefined();
    expect(view(batch?.symbols ?? [])).toEqual(view(single.symbols));
  });

  it('writes its scripts into private random directories', async (ctx) => {
    const bin = await resolvePythonBinary();
    if (!bin) return ctx.skip();
    await parsePy({ file: 'x.py', content: 'x = 1\n', lang: 'py' });
    const paths = (await __privateScriptPathsForTest()).filter(Boolean);
    expect(paths.length).toBeGreaterThan(0);
    for (const scriptPath of paths) {
      expect(path.basename(path.dirname(scriptPath))).toMatch(
        /^ws-(?:go|py)-parse-[A-Za-z0-9]{6}$/,
      );
    }
  });
});
