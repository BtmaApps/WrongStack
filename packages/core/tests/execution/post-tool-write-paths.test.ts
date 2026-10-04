import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { postToolWritePaths } from '../../src/execution/post-tool-write-paths.js';

const root = path.resolve('fixture-root');
const context = { projectRoot: root, cwd: path.join(root, 'nested') };
const identity = (text: string) => text;

describe('bulk-write hook scope', () => {
  it('uses the patch working directory and resolves explicit directories from project root', () => {
    const output = { files: ['a.ts', 'a.ts', './b.ts'], dry_run: false };
    expect(postToolWritePaths('patch', {}, output, context, identity).modifiedPaths).toEqual([
      path.join(context.cwd, 'a.ts'),
      path.join(context.cwd, 'b.ts'),
    ]);
    expect(
      postToolWritePaths('patch', { directory: 'src' }, output, context, identity).modifiedPaths,
    ).toEqual([path.join(root, 'src/a.ts'), path.join(root, 'src/b.ts')]);
  });

  it('uses actual replace results instead of expanding the input glob', () => {
    const changed = path.join(root, 'src/changed.ts');
    const output = { results: [{ path: changed, replacements: 1 }], dry_run: false };
    expect(postToolWritePaths('replace', { files: '**/*.ts' }, output, context, identity)).toEqual({
      modifiedPaths: [changed],
    });
  });

  it('preserves empty previews and leaves unknown output shapes unknown', () => {
    expect(
      postToolWritePaths('patch', {}, { dry_run: true, files: ['a.ts'] }, context, identity),
    ).toEqual({ modifiedPaths: [] });
    for (const output of [
      null,
      'text',
      {},
      { files: ['a.ts'] },
      { dry_run: false, files: 'a.ts' },
    ]) {
      expect(postToolWritePaths('patch', {}, output, context, identity)).toEqual({});
    }
    expect(
      postToolWritePaths('read', {}, { dry_run: false, files: ['a.ts'] }, context, identity),
    ).toEqual({});
  });

  it('bounds the manifest and omits invalid or redacted file identities', () => {
    const files = [
      'secret.ts',
      '',
      'a\0.ts',
      'x'.repeat(4097),
      ...Array.from({ length: 66 }, (_, i) => `file-${i}.ts`),
    ];
    const result = postToolWritePaths('patch', {}, { dry_run: false, files }, context, (text) =>
      text.replace('secret', '[redacted]'),
    );
    expect(result.modifiedPaths).toHaveLength(60);
    expect(result.modifiedPathsOmitted).toBe(10);
    expect(result.modifiedPaths?.some((file) => file.includes('secret'))).toBe(false);
  });
});
