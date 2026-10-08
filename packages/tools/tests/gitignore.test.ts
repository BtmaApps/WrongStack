import { describe, expect, it } from 'vitest';
import { compileGitignore } from '../src/codebase-index/gitignore.js';

describe('compileGitignore', () => {
  it('ignores a bare name at any depth (file or dir)', () => {
    const m = compileGitignore(['node_modules']);
    expect(m('node_modules', true)).toBe(true);
    expect(m('packages/app/node_modules', true)).toBe(true);
    expect(m('node_modules/lib/index.js', false)).toBe(true);
    expect(m('src/app.ts', false)).toBe(false);
  });

  it('does not match a longer name that merely contains the pattern', () => {
    const m = compileGitignore(['build']);
    expect(m('build', true)).toBe(true);
    expect(m('prebuild', true)).toBe(false);
    expect(m('src/build/out.js', false)).toBe(true);
  });

  it('honors trailing-slash directory-only rules', () => {
    const m = compileGitignore(['dist/']);
    // A directory named dist, and files under it, are ignored…
    expect(m('dist', true)).toBe(true);
    expect(m('dist/bundle.js', false)).toBe(true);
    // …but a *file* literally named dist is not.
    expect(m('dist', false)).toBe(false);
  });

  it('anchors patterns that contain a slash', () => {
    const m = compileGitignore(['src/generated/']);
    expect(m('src/generated', true)).toBe(true);
    expect(m('src/generated/api.ts', false)).toBe(true);
    // Same leaf name elsewhere is NOT ignored (anchored to root).
    expect(m('lib/generated/api.ts', false)).toBe(false);
  });

  it('anchors patterns with a leading slash', () => {
    const m = compileGitignore(['/secret.ts']);
    expect(m('secret.ts', false)).toBe(true);
    expect(m('src/secret.ts', false)).toBe(false);
  });

  it('supports * and ** and ? globs', () => {
    const m = compileGitignore(['*.log', '**/tmp', 'file?.ts']);
    expect(m('app.log', false)).toBe(true);
    expect(m('deep/nested/app.log', false)).toBe(true);
    expect(m('a/b/tmp', true)).toBe(true);
    expect(m('file1.ts', false)).toBe(true);
    expect(m('file10.ts', false)).toBe(false);
  });

  it('applies negation with last-match-wins', () => {
    const m = compileGitignore(['*.ts', '!keep.ts']);
    expect(m('drop.ts', false)).toBe(true);
    expect(m('keep.ts', false)).toBe(false);
  });

  it('skips blanks and comments', () => {
    const m = compileGitignore(['', '# a comment', '   ', 'dist']);
    expect(m('dist', true)).toBe(true);
    expect(m('src/x.ts', false)).toBe(false);
  });

  it('normalizes backslash paths (Windows)', () => {
    const m = compileGitignore(['node_modules']);
    expect(m('packages\\app\\node_modules\\lib.js', false)).toBe(true);
  });

  it('applies a negation to the path it matches, not to everything under it', () => {
    // Verdicts from `git ls-files -o -i --exclude-standard` on real trees: a
    // `!rule` re-included whole subtrees that git keeps ignored.
    expect(compileGitignore(['[ab]', '!foo/'])('foo/a/x.ts', false)).toBe(true);
    expect(compileGitignore(['[ab]/*', '!/a*'])('a/ab', false)).toBe(true);
    expect(compileGitignore(['**/*.ts/*', '!b/'])('b/x.ts/x.ts', false)).toBe(true);
    expect(compileGitignore(['foo', '!/f*o*'])('foobar/foo/foobar', false)).toBe(true);
    // …while a matched path itself is still re-included.
    expect(compileGitignore(['a', '!a/'])('a/x', false)).toBe(false);
    expect(compileGitignore(['*.log', '!keep.log'])('logs/keep.log', false)).toBe(false);
  });
});
