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

// Removing an unused binding must not remove what its initializer DOES:
// typecheck verification stays green when a side effect silently disappears.
describe('dead-code fix keeps side-effecting initializers', () => {
  let ts: Ts;
  beforeAll(async () => {
    ts = await loadTypescript();
  });

  it('unused local keeps its call as a statement', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'const handle = startServer();\nexport const k = 1;\n',
      ops({ removeLocals: ['handle'] }),
    );
    expect(out).toBe('startServer();\nexport const k = 1;\n');
  });

  it('unused export keeps its call', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'export const reg = create();\nexport const keep = 1;\n',
      ops({ removeDeclarations: ['reg'] }),
    );
    expect(out).toBe('create();\nexport const keep = 1;\n');
  });

  it('cascade keeps the initializer of a binding the edit orphaned', () => {
    const original =
      'const handle = start();\nexport function stop(): void {\n  handle.close();\n}\nexport const x = 1;\n';
    const current = computeFileEdit(ts, 'a.ts', original, ops({ removeDeclarations: ['stop'] }));
    expect(cascadeCleanup(ts, 'a.ts', original, current)).toBe('start();\nexport const x = 1;\n');
  });

  it('wraps an object literal so it stays an expression', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'const cfg = { a: load() };\nexport const k = 1;\n',
      ops({ removeLocals: ['cfg'] }),
    );
    expect(out).toBe('({ a: load() });\nexport const k = 1;\n');
  });

  it('still removes pure initializers entirely', () => {
    const out = computeFileEdit(
      ts,
      'a.ts',
      'const a = { x: 1, y: [2, 3] };\nconst b = `v${a}`;\nconst c = -1 + 2;\nexport const k = 1;\n',
      ops({ removeLocals: ['a', 'b', 'c'] }),
    );
    expect(out).toBe('export const k = 1;\n');
  });
});
