import { expect, it } from 'vitest';
import { retryAfterMsFromBody } from '../src/error-parse.js';

it.each([
  ['Quota resets in 5ms', 5],
  ['Quota resets in 1m500ms', 60_500],
  ['Quota resets in 0ms', undefined],
  ['Quota resets in 5m', 300_000],
  ['Quota resets in 2h7m23s', 7_643_000],
  ['Please retry after 5ms', 5],
  ['Quota resets in 25h', undefined],
])('preserves reset duration units in %s', (message, expected) => {
  expect(retryAfterMsFromBody({ message: message as string })).toBe(expected);
});
