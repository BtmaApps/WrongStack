import { beforeAll, describe, expect, it } from 'vitest';
import { cascadeCleanup, computeFileEdit, type FileOps } from '../src/dead-code/fix-edits.js';
import { loadTypescript } from '../src/dead-code/parse.js';

type Ts = Awaited<ReturnType<typeof loadTypescript>>;

const ops = (o: Partial<Record<keyof FileOps, string[]>>): FileOps => ({
  removeDeclarations: new Set(o.removeDeclarations ?? []),
  removeLocals: new Set(o.removeLocals ?? []),
  unexport: new Set(o.unexport ?? []),
  removeReexports: new Set(o.removeReexports ?? []),
});

// `delete obj.prop` mutates the object, so an unused binding initialized by a
// delete must keep the delete as an expression statement — like any
// side-effecting initializer. `delete` is its own DeleteExpression node (no
// prefix-unary shortcut), so the purity checker must keep answering "impure"
// for it even as sibling discarding operators like `typeof`/`void` are seen
// through to their operands.
describe('dead-code fix keeps delete initializers', () => {
  let ts: Ts;
  beforeAll(async () => {
    ts = await loadTypescript();
  });

  it('unused local keeps its delete as a statement', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'const ok = delete cache.stale;\nexport const k = 1;\n',
      ops({ removeLocals: ['ok'] }),
    );
    expect(out).toBe('delete cache.stale;\nexport const k = 1;\n');
  });

  it('cascade keeps a delete assignment inside a surviving function', () => {
    const original =
      'let ok = false;\n' +
      'export function use(): boolean {\n  return ok;\n}\n' +
      'export function refresh(): void {\n  ok = delete cache.stale;\n}\n' +
      'export const k = 1;\n';
    const current = computeFileEdit(ts, 'a.ts', original, ops({ removeDeclarations: ['use'] }));
    expect(cascadeCleanup(ts, 'a.ts', original, current)).toBe(current);
  });

  it('still removes genuinely pure unary initializers', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'const n = -1;\nconst t = typeof flag;\nconst u = void 0;\nexport const k = 1;\n',
      ops({ removeLocals: ['n', 't', 'u'] }),
    );
    expect(out).toBe('export const k = 1;\n');
  });
});
