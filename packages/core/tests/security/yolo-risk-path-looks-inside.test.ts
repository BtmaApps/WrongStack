import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathLooksInsideProject } from '../../src/security/yolo-risk.js';

// `pathLooksInsideProject` used a bare `relative.startsWith('..')`, which
// misclassified a legal in-root first segment that begins with '..' as
// outside the project — and a "false" here is the value that lets the
// in-project destructive-command gates be skipped. Canonical predicate:
// relative !== '..' && !relative.startsWith('..' + sep) && !isAbsolute.
describe('pathLooksInsideProject', () => {
  const root = path.resolve('/project/root');

  it('accepts a legal in-root ..-prefixed first segment', () => {
    expect(pathLooksInsideProject(path.join(root, '..hidden', 'x.txt'), root)).toBe(true);
    expect(pathLooksInsideProject('..hidden/x.txt', root)).toBe(true);
  });

  it('accepts ordinary in-root relative paths', () => {
    expect(pathLooksInsideProject('src/x.ts', root)).toBe(true);
  });

  it('rejects real parent traversal', () => {
    expect(pathLooksInsideProject('../outside.txt', root)).toBe(false);
    expect(pathLooksInsideProject(path.resolve(root, '..', 'outside.txt'), root)).toBe(false);
  });

  it('keeps the root itself out of "inside" (empty relative)', () => {
    expect(pathLooksInsideProject(root, root)).toBe(false);
  });
});
