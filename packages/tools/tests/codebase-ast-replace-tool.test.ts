import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codebaseAstReplaceTool, replaceSymbolInFile } from '../src/codebase-index/index.js';

describe('codebase-ast-replace tool & mutator', () => {
  it('surgically replaces a TypeScript function body without breaking signatures', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mut-ts-'));
    const filePath = path.join(tempDir, 'math.ts');

    const originalCode = `
import { Config } from './config.js';

/**
 * Multiplies two numbers.
 */
export function calculate(a: number, b: number): number {
  const oldVal = a + b;
  return oldVal;
}

export function other(): string {
  return 'untouched';
}
`;
    await fs.writeFile(filePath, originalCode, 'utf8');

    try {
      const res = await replaceSymbolInFile(
        {
          file: filePath,
          symbol: 'calculate',
          newBody: 'return a * b * 100;',
          target: 'body',
        },
        tempDir,
      );

      expect(res.symbol).toBe('calculate');
      expect(res.updatedContent).toContain(
        'export function calculate(a: number, b: number): number {',
      );
      expect(res.updatedContent).toContain('return a * b * 100;');
      expect(res.updatedContent).not.toContain('const oldVal = a + b');
      expect(res.updatedContent).toContain("return 'untouched';");

      // Verify on disk
      const onDisk = await fs.readFile(filePath, 'utf8');
      expect(onDisk).toBe(res.updatedContent);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('surgically replaces a Python function body via Tree-Sitter', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mut-py-'));
    const filePath = path.join(tempDir, 'service.py');

    const originalPy = `
def process_data(items):
    """Old process."""
    result = []
    for x in items:
        result.append(x * 2)
    return result

def helper():
    return True
`;
    await fs.writeFile(filePath, originalPy, 'utf8');

    try {
      const res = await replaceSymbolInFile(
        {
          file: filePath,
          symbol: 'process_data',
          newBody: 'return [x * 10 for x in items]',
          target: 'body',
        },
        tempDir,
      );

      expect(res.symbol).toBe('process_data');
      expect(res.updatedContent).toContain('def process_data(items):');
      expect(res.updatedContent).toContain('return [x * 10 for x in items]');
      expect(res.updatedContent).not.toContain('result.append');
      expect(res.updatedContent).toContain('def helper():');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('executes codebase-ast-replace tool successfully', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mut-tool-'));
    const filePath = path.join(tempDir, 'app.ts');

    await fs.writeFile(
      filePath,
      'export function greet(name: string): string {\n  return "Hello " + name;\n}',
      'utf8',
    );

    try {
      const output = await codebaseAstReplaceTool.execute(
        {
          file: filePath,
          symbol: 'greet',
          newBody: 'return `Welcome, ${name.toUpperCase()}!`;',
        },
        { projectRoot: tempDir } as never,
        { signal: new AbortController().signal },
      );

      expect(output.status).toBe('ok');
      expect(output.symbol).toBe('greet');

      const diskContent = await fs.readFile(filePath, 'utf8');
      expect(diskContent).toContain('Welcome, ${name.toUpperCase()}!');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects breaking changes with target=full unless allowBreakingChanges is set', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mut-inv-'));
    const filePath = path.join(tempDir, 'payment.ts');

    await fs.writeFile(
      filePath,
      'export function pay(amount: number): boolean {\n  return true;\n}',
      'utf8',
    );

    try {
      // 1. Fails when breaking change (mandatory param addition) is introduced.
      // It must THROW: a returned `status: 'error'` payload was a successful
      // call to the executor (is_error:false) and rendered as "ok".
      const rejected = codebaseAstReplaceTool.execute(
        {
          file: filePath,
          symbol: 'pay',
          newBody: 'export function pay(amount: number, fee: number): boolean {\n  return true;\n}',
          target: 'full',
        },
        { projectRoot: tempDir } as never,
        { signal: new AbortController().signal },
      );

      await expect(rejected).rejects.toThrow(/AST Invariant Violation[\s\S]*INV-002/);

      // 2. Succeeds when allowBreakingChanges: true is passed
      const forcedOutput = await codebaseAstReplaceTool.execute(
        {
          file: filePath,
          symbol: 'pay',
          newBody: 'export function pay(amount: number, fee: number): boolean {\n  return true;\n}',
          target: 'full',
          allowBreakingChanges: true,
        },
        { projectRoot: tempDir } as never,
        { signal: new AbortController().signal },
      );

      expect(forcedOutput.status).toBe('ok');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('codebase-ast-replace symbol resolution', () => {
  async function withFile(
    name: string,
    code: string,
    run: (filePath: string, dir: string) => Promise<void>,
  ): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mut-res-'));
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, code, 'utf8');
    try {
      await run(filePath, dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it('explains that a test-case title is not a declaration (and writes nothing)', async () => {
    const code = [
      "describe('suite', () => {",
      "  it('returns cancelled when the signal aborts (no prompt sent)', async () => {",
      '    expect(1).toBe(1);',
      '  });',
      '});',
      '',
    ].join('\n');
    await withFile('a.test.ts', code, async (filePath, dir) => {
      await expect(
        replaceSymbolInFile(
          {
            file: filePath,
            symbol: 'returns cancelled when the signal aborts (no prompt sent)',
            newBody: 'expect(2).toBe(2);',
          },
          dir,
        ),
      ).rejects.toThrow(/test-case title, not a declaration[\s\S]*edit tool/);
      expect(await fs.readFile(filePath, 'utf8')).toBe(code);
    });
  });

  it('flags a non-identifier symbol that is not a test title', async () => {
    await withFile('b.ts', 'export function f(): void {}\n', async (filePath, dir) => {
      await expect(
        replaceSymbolInFile({ file: filePath, symbol: 'do the thing', newBody: 'return;' }, dir),
      ).rejects.toThrow(/is not a declaration name/);
    });
  });

  it('refuses an ambiguous name and accepts the qualified one', async () => {
    const code = [
      'export class Cart {',
      '  total(): number {',
      '    return 1;',
      '  }',
      '}',
      'export class Invoice {',
      '  total(): number {',
      '    return 2;',
      '  }',
      '}',
      '',
    ].join('\n');
    await withFile('c.ts', code, async (filePath, dir) => {
      await expect(
        replaceSymbolInFile({ file: filePath, symbol: 'total', newBody: 'return 3;' }, dir),
      ).rejects.toThrow(/ambiguous[\s\S]*Cart\.total \(L2\)[\s\S]*Invoice\.total \(L7\)/);
      expect(await fs.readFile(filePath, 'utf8')).toBe(code);

      const res = await replaceSymbolInFile(
        { file: filePath, symbol: 'Invoice.total', newBody: 'const x = 3;\nreturn x;' },
        dir,
      );
      // Body re-indented relative to the method (depth 1 → statements at depth 2).
      expect(res.updatedContent).toContain(
        '  total(): number {\n    const x = 3;\n    return x;\n  }\n}',
      );
      expect(res.updatedContent).toContain('return 1;');
    });
  });

  it('treats overload signatures + one implementation as a single symbol', async () => {
    const code = [
      'export function pick(a: string): string;',
      'export function pick(a: number): number;',
      'export function pick(a: string | number): string | number {',
      '  return a;',
      '}',
      '',
    ].join('\n');
    await withFile('d.ts', code, async (filePath, dir) => {
      const res = await replaceSymbolInFile(
        { file: filePath, symbol: 'pick', newBody: 'return typeof a === "string" ? a : a + 1;' },
        dir,
      );
      expect(res.updatedContent).toContain('export function pick(a: string): string;');
      expect(res.updatedContent).toContain('return typeof a === "string" ? a : a + 1;');
      expect(res.updatedContent).not.toContain('  return a;\n');
    });
  });

  it('resolves type aliases (body = the aliased type) and enums (full)', async () => {
    const code = "export type Mode = 'a' | 'b';\nexport enum Level {\n  Low,\n}\n";
    await withFile('e.ts', code, async (filePath, dir) => {
      const res = await replaceSymbolInFile(
        { file: filePath, symbol: 'Mode', newBody: "'a' | 'b' | 'c'", checkInvariants: false },
        dir,
      );
      expect(res.updatedContent).toContain("export type Mode = 'a' | 'b' | 'c';");

      const res2 = await replaceSymbolInFile(
        {
          file: filePath,
          symbol: 'Level',
          newBody: 'export enum Level {\n  Low,\n  High,\n}',
          target: 'full',
          checkInvariants: false,
        },
        dir,
      );
      expect(res2.updatedContent).toContain('export enum Level {\n  Low,\n  High,\n}');
    });
  });

  it('target=full on a const replaces the whole statement (no doubled keywords)', async () => {
    const code = 'export const limit = (n: number): number => n;\n';
    await withFile('f.ts', code, async (filePath, dir) => {
      const res = await replaceSymbolInFile(
        {
          file: filePath,
          symbol: 'limit',
          newBody: 'export const limit = (n: number): number => Math.min(n, 10);',
          target: 'full',
          checkInvariants: false,
        },
        dir,
      );
      expect(res.updatedContent).toBe(
        'export const limit = (n: number): number => Math.min(n, 10);\n',
      );
    });
  });
});
