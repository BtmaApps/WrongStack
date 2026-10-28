import { expect, it } from 'vitest';
import { readHistoryPage } from '../src/history-page-model';

const revision = 'a'.repeat(64);
it('accepts bounded continuations and exact-ID anchor pages without inventing totals', () => {
  const page = {
    offset: 1000,
    limit: 100,
    total: 1105,
    nextOffset: 1100,
    revision,
    truncated: false,
  };
  expect(readHistoryPage(page, 1000, 100, 100)).toEqual(page);
  expect(readHistoryPage(page, null, 100, 100).offset).toBe(1000);
  expect(
    readHistoryPage({ ...page, offset: 1100, nextOffset: null }, 1100, 100, 5).nextOffset,
  ).toBeNull();
});
it('refuses old-host replies, foreign offsets, invalid totals and looping cursors', () => {
  expect(() => readHistoryPage(undefined, 0, 100, 50)).toThrow();
  const page = { offset: 0, limit: 100, total: 1105, nextOffset: 100, revision, truncated: false };
  expect(() => readHistoryPage(page, 100, 100, 100)).toThrow('different');
  expect(() => readHistoryPage({ ...page, nextOffset: 0 }, 0, 100, 100)).toThrow('invalid');
  expect(() => readHistoryPage({ ...page, total: 2 }, 0, 100, 100)).toThrow('invalid');
  expect(() => readHistoryPage({ ...page, offset: 1 }, null, 100, 100)).toThrow('different');
});
