import { describe, expect, it } from 'vitest';
import type { FileNode } from '../src/file-model';
import { treeWindow, visibleTreeRows } from '../src/file-tree-rows';

const file = (path: string): FileNode => ({
  name: path.split('/').at(-1)!,
  path,
  type: 'file',
  children: [],
});
const dir = (path: string, children: FileNode[]): FileNode => ({
  name: path.split('/').at(-1)!,
  path,
  type: 'directory',
  children,
});
const tree = [
  dir('src', [
    dir('src/core', [file('src/core/agent.ts'), file('src/core/loop.ts')]),
    file('src/index.ts'),
  ]),
  file('README.md'),
];
const paths = (rows: ReturnType<typeof visibleTreeRows>) => rows.map((row) => row.node.path);

describe('virtual file tree rows', () => {
  it('shows only expanded folders, with depth', () => {
    expect(paths(visibleTreeRows(tree, new Set(), ''))).toEqual(['src', 'README.md']);
    const rows = visibleTreeRows(tree, new Set(['src']), '');
    expect(paths(rows)).toEqual(['src', 'src/core', 'src/index.ts', 'README.md']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
    expect(rows[1]?.open).toBe(false);
  });
  it('keeps matches and their ancestors open while searching', () => {
    expect(paths(visibleTreeRows(tree, new Set(), 'LOOP'))).toEqual([
      'src',
      'src/core',
      'src/core/loop.ts',
    ]);
    expect(visibleTreeRows(tree, new Set(), 'missing')).toEqual([]);
  });
  it('handles a large tree in one pass', () => {
    const big = [
      dir(
        'big',
        Array.from({ length: 20000 }, (_, index) => file(`big/file-${index}.ts`)),
      ),
    ];
    const started = performance.now();
    const rows = visibleTreeRows(big, new Set(['big']), 'file-1999');
    expect(paths(rows)).toEqual([
      'big',
      'big/file-1999.ts',
      ...Array.from({ length: 10 }, (_, digit) => `big/file-1999${digit}.ts`),
    ]);
    expect(performance.now() - started).toBeLessThan(500);
  });
  it('computes a bounded render window', () => {
    expect(treeWindow(0, 0, 500, 29)).toEqual({ start: 0, end: 0 });
    expect(treeWindow(20000, 0, 580, 29, 5)).toEqual({ start: 0, end: 25 });
    expect(treeWindow(20000, 29 * 1000, 580, 29, 5)).toEqual({ start: 995, end: 1025 });
    expect(treeWindow(30, 29 * 1000, 580, 29, 5)).toEqual({ start: 995, end: 30 });
  });
});
