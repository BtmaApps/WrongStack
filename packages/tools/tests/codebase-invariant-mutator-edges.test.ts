import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { polyglotInvariantEngine } from '../src/codebase-index/ast-invariant-engine.js';
import {
  codebaseInvariantCheckTool,
  codebaseRepoMapTool,
  replaceSymbolInFile,
} from '../src/codebase-index/index.js';

const signal = () => ({ signal: new AbortController().signal });

async function rules(originalCode: string, modifiedCode: string, lang: 'ts' | 'py' | 'go' | 'rs') {
  const res = await polyglotInvariantEngine.evaluate({ originalCode, modifiedCode, lang });
  return res.violations.map((v) => `${v.ruleId}:${v.symbolName}`);
}

async function withFile(
  name: string,
  code: string,
  run: (filePath: string, dir: string) => Promise<void>,
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inv-mut-edge-'));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, code, 'utf8');
  try {
    await run(filePath, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('invariant engine — TS export forms', () => {
  it('flags removal of exported const, enum, type alias and default export', async () => {
    const orig = [
      'export const API_URL = "x";',
      'export enum Level { Low }',
      "export type Mode = 'a' | 'b';",
      'export default function main() {}',
    ].join('\n');
    expect(await rules(orig, '', 'ts')).toEqual(
      expect.arrayContaining([
        'INV-001:API_URL',
        'INV-001:Level',
        'INV-001:Mode',
        'INV-001:default',
      ]),
    );
  });

  it('flags a mandatory parameter added to an exported arrow function and a constructor', async () => {
    const orig =
      'export const f = (a: number) => a;\nexport class S { constructor(a: number) {} }\n';
    const mod =
      'export const f = (a: number, b: number) => a;\nexport class S { constructor(a: number, b: number) {} }\n';
    expect(await rules(orig, mod, 'ts')).toEqual(
      expect.arrayContaining(['INV-002:f', 'INV-002:S.constructor']),
    );
  });

  it('does not let same-named locals in different functions collide', async () => {
    const orig =
      'export function a() { const h = (x: number) => x; }\nexport function b() { const h = () => 1; }\n';
    const mod =
      'export function a() { const h = (x: number) => x; }\nexport function b() { const h = (y: number) => y; }\n';
    expect(await rules(orig, mod, 'ts')).toEqual([]);
  });
});

describe('invariant engine — scoped tree-sitter contracts', () => {
  it('Rust: impl methods are keyed by their type', async () => {
    const orig =
      'pub struct A;\npub struct B;\nimpl A { pub fn new() -> A { A } }\nimpl B { pub fn new() -> B { B } }\n';
    const mod =
      'pub struct A;\npub struct B;\nimpl A { pub fn new() -> A { A } }\nimpl B { pub fn new(x: u8) -> B { B } }\n';
    expect(await rules(orig, mod, 'rs')).toEqual(['INV-002:B.new']);
  });

  it('Go: `a, b int` counts as two parameters and methods are keyed by receiver', async () => {
    expect(
      await rules('package p\nfunc F(a, b int) {}\n', 'package p\nfunc F(a, b, c int) {}\n', 'go'),
    ).toEqual(['INV-002:F']);
    const orig =
      'package p\ntype A struct{}\ntype B struct{}\nfunc (x *A) Run() {}\nfunc (x B) Run() {}\n';
    const mod =
      'package p\ntype A struct{}\ntype B struct{}\nfunc (x *A) Run() {}\nfunc (x B) Run(n int) {}\n';
    expect(await rules(orig, mod, 'go')).toEqual(['INV-002:B.Run']);
  });

  it('Python: class methods are keyed by class; `/` is not a parameter', async () => {
    const orig =
      'class A:\n    def run(self):\n        pass\nclass B:\n    def run(self):\n        pass\n';
    const mod =
      'class A:\n    def run(self):\n        pass\nclass B:\n    def run(self, n):\n        pass\n';
    expect(await rules(orig, mod, 'py')).toEqual(['INV-002:B.run']);
    expect(await rules('def f(a):\n    pass\n', 'def f(a, /):\n    pass\n', 'py')).toEqual([]);
  });
});

describe('codebase-invariant-check tool', () => {
  it('reports languages without rules as not verified', async () => {
    const out = await codebaseInvariantCheckTool.execute(
      {
        originalCode: 'class A { public void run() {} }',
        modifiedCode: 'class A {}',
        lang: 'java',
      },
      { projectRoot: os.tmpdir() } as never,
      signal(),
    );
    expect(out.verified).toBe(false);
    expect(out.summary).toMatch(/NOT VERIFIED/);
  });

  it('treats an explicit empty originalCode as the baseline instead of reading the file', async () => {
    await withFile('m.ts', 'export function keep() {}\n', async (filePath, dir) => {
      const out = await codebaseInvariantCheckTool.execute(
        { file: filePath, originalCode: '', modifiedCode: 'export function added() {}\n' },
        { projectRoot: dir } as never,
        signal(),
      );
      expect(out.valid).toBe(true);
      expect(out.verified).toBe(true);
    });
  });

  it('rejects an unknown lang', async () => {
    await expect(
      codebaseInvariantCheckTool.execute(
        { originalCode: '', modifiedCode: '', lang: 'typescript' as never },
        { projectRoot: os.tmpdir() } as never,
        signal(),
      ),
    ).rejects.toThrow(/unknown lang/);
  });
});

describe('codebase-ast-replace — body semantics', () => {
  it('refuses body mode on a class instead of overwriting the declaration', async () => {
    const code = 'export class Cart {\n  total(): number {\n    return 1;\n  }\n}\n';
    await withFile('a.ts', code, async (filePath, dir) => {
      await expect(
        replaceSymbolInFile({ file: filePath, symbol: 'Cart', newBody: 'x() {}' }, dir),
      ).rejects.toThrow(/no replaceable body[\s\S]*target: "full"/);
      expect(await fs.readFile(filePath, 'utf8')).toBe(code);
    });
  });

  it('promotes an expression-bodied arrow to a block when given statements', async () => {
    await withFile('b.ts', 'export const f = (n: number) => n;\n', async (filePath, dir) => {
      const res = await replaceSymbolInFile(
        { file: filePath, symbol: 'f', newBody: 'return n * 2;' },
        dir,
      );
      expect(res.updatedContent).toBe('export const f = (n: number) => {\n  return n * 2;\n};\n');
    });
  });

  it('Python: indents a method body at its own depth and resolves qualified names', async () => {
    const code = [
      'class A:',
      '    def run(self):',
      '        return 1',
      '',
      'class B:',
      '    def run(self):',
      '        return 2',
      '',
    ].join('\n');
    await withFile('c.py', code, async (filePath, dir) => {
      await expect(
        replaceSymbolInFile({ file: filePath, symbol: 'run', newBody: 'return 3' }, dir),
      ).rejects.toThrow(/ambiguous[\s\S]*A\.run[\s\S]*B\.run/);

      const res = await replaceSymbolInFile(
        { file: filePath, symbol: 'B.run', newBody: 'x = 3\nreturn x' },
        dir,
      );
      expect(res.updatedContent).toContain('    def run(self):\n        x = 3\n        return x\n');
      expect(res.updatedContent).toContain('        return 1');
    });
  });

  it('Go: keeps the body a block, indented with tabs', async () => {
    await withFile(
      'd.go',
      'package p\n\nfunc Add(a, b int) int {\n\treturn a + b\n}\n',
      async (filePath, dir) => {
        const res = await replaceSymbolInFile(
          { file: filePath, symbol: 'Add', newBody: 'return a * b' },
          dir,
        );
        expect(res.updatedContent).toBe(
          'package p\n\nfunc Add(a, b int) int {\n\treturn a * b\n}\n',
        );
      },
    );
  });

  it('C: finds a function through its declarator chain', async () => {
    await withFile(
      'e.c',
      'int add(int a, int b) {\n    return a + b;\n}\n',
      async (filePath, dir) => {
        const res = await replaceSymbolInFile(
          { file: filePath, symbol: 'add', newBody: 'return a * b;' },
          dir,
        );
        expect(res.updatedContent).toBe('int add(int a, int b) {\n    return a * b;\n}\n');
      },
    );
  });
});

describe('codebase-repo-map — focusFiles containment', () => {
  it('rejects a focus file outside the project root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-map-focus-'));
    const project = path.join(parent, 'project');
    const secret = path.join(parent, 'secret.ts');
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(secret, 'export const TOKEN = "s3cr3t";\n', 'utf8');
    try {
      await expect(
        codebaseRepoMapTool.execute(
          { focusFiles: [secret] },
          { projectRoot: project } as never,
          signal(),
        ),
      ).rejects.toThrow();
      await expect(
        codebaseRepoMapTool.execute(
          { focusFiles: ['../secret.ts'] },
          { projectRoot: project } as never,
          signal(),
        ),
      ).rejects.toThrow();
    } finally {
      await fs.rm(parent, { recursive: true, force: true });
    }
  });
});
