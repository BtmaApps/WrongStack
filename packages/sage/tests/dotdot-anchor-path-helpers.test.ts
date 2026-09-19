/**
 * Per-site regressions for two wave-2 dot-dot fixes in SAGE anchor-path
 * handling:
 *
 * 1. `toProjectRelative` (shared/path-remap.ts) used a bare
 *    `startsWith('..')` escape test, so legal in-root first segments like
 *    `..hidden/x.ts` fell into the out-of-project fallback and were stored
 *    as raw caller input instead of the project-relative form.
 * 2. `resolveTriggerPaths` (middleware/tool-call-memory-triggers.ts)
 *    dropped tool-call paths under such directories, so evidence anchors
 *    never formed for `..`-prefixed in-root files.
 *
 * Both functions are lexical (no fs access), so the assertions are exact.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTriggerPaths } from '../src/middleware/tool-call-memory-triggers.js';
import { toProjectRelative } from '../src/shared/path-remap.js';

const projectRoot = path.join(os.tmpdir(), 'wstack-sage-dotdot');
const ctx = { projectRoot, workingDir: projectRoot, cwd: projectRoot };

describe('toProjectRelative', () => {
  it('keeps legal in-root ..-prefixed paths project-relative', () => {
    const abs = path.join(projectRoot, '..hidden', 'x.ts');
    expect(toProjectRelative(projectRoot, projectRoot, abs)).toBe('..hidden/x.ts');
  });

  it('control: ordinary in-root paths normalize with forward slashes', () => {
    const abs = path.join(projectRoot, 'src', 'a.ts');
    expect(toProjectRelative(projectRoot, projectRoot, abs)).toBe('src/a.ts');
  });

  it('still falls back to the raw path for a real ../ escape outside the project root', () => {
    const outside = path.join(path.dirname(projectRoot), 'outside.ts');
    expect(toProjectRelative(projectRoot, projectRoot, outside)).toBe(
      outside.split(path.sep).join('/'),
    );
  });
});

describe('resolveTriggerPaths', () => {
  it('keeps legal in-root ..-prefixed tool-call paths as anchors', () => {
    const abs = path.join(projectRoot, '..hidden', 'c.ts');
    const result = resolveTriggerPaths(['..hidden/a.ts', abs], ctx as never);
    expect(result).toEqual([path.join(projectRoot, '..hidden', 'a.ts'), abs]);
  });

  it('still drops a real ../ climb outside the project root', () => {
    expect(resolveTriggerPaths(['../outside.ts'], ctx as never)).toEqual([]);
  });

  it('control: ordinary relative paths resolve, duplicates dedupe, globs are skipped', () => {
    const result = resolveTriggerPaths(['src/b.ts', 'src/b.ts', '..hidden/*.ts'], ctx as never);
    expect(result).toEqual([path.join(projectRoot, 'src', 'b.ts')]);
  });
});
