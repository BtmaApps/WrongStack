import { expect, it } from 'vitest';
import { compileGitignore } from '../src/codebase-index/gitignore.js';

it('preserves significant leading spaces and literal leading-space hashes', () => {
  const matcher = compileGitignore(['ordinary.txt', '  file.txt', '  #literal']);
  expect(
    ['ordinary.txt', 'file.txt', '  file.txt', '  #literal'].map((file) => matcher(file, false)),
  ).toEqual([true, false, true, true]);
  expect(matcher('sub/  file.txt', false)).toBe(true);
});
it('keeps negation, true comments, escaped markers and trailing-space behavior', () => {
  const matcher = compileGitignore([
    '  file.txt',
    '!sub/  file.txt',
    '# comment',
    '\\#literal',
    '\\!literal',
    'normal.txt   ',
  ]);
  expect(matcher('  file.txt', false)).toBe(true);
  expect(matcher('sub/  file.txt', false)).toBe(false);
  expect(matcher('#literal', false)).toBe(true);
  expect(matcher('!literal', false)).toBe(true);
  expect(matcher('normal.txt', false)).toBe(true);
  expect(compileGitignore([])('x', false)).toBe(false);
});
