import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const { parseTypecheckDiagnostics } = await import(
  pathToFileURL(path.join(repoRoot, 'scripts/lib/test-typecheck-diagnostics.mjs')).href
);

describe('Bun test typecheck baseline compatibility', () => {
  it('keeps the same identity with a private checker cwd, summary and CI annotation', () => {
    const cwd = path.join(repoRoot, '.bun/typecheck/check-cwd');
    const file = path.join(repoRoot, 'packages/example/tests/value.test.ts');
    const message = "Type 'string' is not assignable to type 'number'.";
    const oldResult = {
      project: { id: 'packages/example' },
      cwd: repoRoot,
      output: `packages/example/tests/value.test.ts(2,7): error TS2322: ${message}`,
    };
    const bunResult = {
      project: oldResult.project,
      cwd,
      output:
        `${path.relative(cwd, file)}(2,7): error TS2322: ${message}\n` +
        'Found 1 error in 1 file, checked 2 files [20.00ms]\n' +
        'Errors  Files\n     1  ../../../packages/example/tests/value.test.ts:2\n' +
        `::error file=${file},line=2,title=TS2322::${message}\n`,
    };
    expect(parseTypecheckDiagnostics(bunResult, repoRoot)).toEqual(
      parseTypecheckDiagnostics(oldResult, repoRoot),
    );
    expect(parseTypecheckDiagnostics(bunResult, repoRoot)[0].key).toBe(
      `packages/example|packages/example/tests/value.test.ts|TS2322|${message}`,
    );
  });

  it('keeps multiline compiler details and normalizes absolute paths in messages', () => {
    const result = {
      project: { id: 'packages/example' },
      cwd: repoRoot,
      output: `error TS6059: File '${repoRoot}/outside.ts' is outside rootDir.\n  Required by a static import.\n`,
    };
    expect(parseTypecheckDiagnostics(result, repoRoot)).toMatchObject([
      {
        file: '<project>',
        code: 'TS6059',
        message: "File '<repo>/outside.ts' is outside rootDir. Required by a static import.",
      },
    ]);
  });
});
