import { expect, it } from 'vitest';
import { compareLines } from '../src/lib/diff';

it.each([
  ['', 'new file'],
  ['deleted file', ''],
  ['a\nb\nc', 'a\nchanged\nc'],
  ['a\nb\nc', 'a\nadded\nb\nc'],
  ['a\na\nb', 'a\nb'],
  ['a\r\nb', 'a\nb'],
  ['a\nb\n', 'b\n'],
])('reconstructs both file versions from the displayed diff: %j → %j', (before, after) => {
  const lines = compareLines(before, after);
  expect(
    lines
      .filter((line) => line.kind !== 'add')
      .map((line) => line.text)
      .join('\n'),
  ).toBe(before.replaceAll('\r\n', '\n'));
  expect(
    lines
      .filter((line) => line.kind !== 'remove')
      .map((line) => line.text)
      .join('\n'),
  ).toBe(after.replaceAll('\r\n', '\n'));
});
it('marks additions and removals while preserving equal surrounding lines', () => {
  expect(compareLines('a\nb\nc', 'a\nx\nc').map((line) => line.kind)).toEqual([
    'context',
    'remove',
    'add',
    'context',
  ]);
});
