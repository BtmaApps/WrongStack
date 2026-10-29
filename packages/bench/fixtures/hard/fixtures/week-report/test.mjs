import assert from 'node:assert/strict';
import { isoWeek, weekKey } from './src/dates.js';
import { formatCents, parseCents } from './src/money.js';
import { weeklyReport } from './src/report.js';
import { sortBy } from './src/sort.js';

// HARD_SENTINEL_week-report

// ---- ISO-8601 weeks ----
assert.deepEqual(isoWeek('2021-01-04'), { year: 2021, week: 1 }); // Monday
assert.deepEqual(isoWeek('2021-01-10'), { year: 2021, week: 1 }); // Sunday ends week 1
assert.deepEqual(isoWeek('2021-01-03'), { year: 2020, week: 53 }); // Sunday belongs to previous ISO year
assert.deepEqual(isoWeek('2020-12-31'), { year: 2020, week: 53 });
assert.deepEqual(isoWeek('2019-12-30'), { year: 2020, week: 1 }); // Monday belongs to next ISO year
assert.deepEqual(isoWeek('2008-12-29'), { year: 2009, week: 1 });
assert.deepEqual(isoWeek('2010-01-03'), { year: 2009, week: 53 });
assert.deepEqual(isoWeek('2026-02-01'), { year: 2026, week: 5 }); // a Sunday mid-year
assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
assert.equal(weekKey('2026-02-01'), '2026-W05');
assert.equal(weekKey('2021-01-03'), '2020-W53');
assert.equal(weekKey('2026-12-28'), '2026-W53');

// ---- money ----
assert.equal(parseCents('0.29'), 29);
assert.equal(parseCents('0.57'), 57);
assert.equal(parseCents('1.15'), 115);
assert.equal(parseCents('-0.57'), -57);
assert.equal(parseCents('3'), 300);
assert.equal(parseCents('1.5'), 150);
assert.equal(parseCents('19.99'), 1999);
for (const bad of ['', 'abc', '1.234', '1.', '.5', '1,50', ' 1.00', '1e2', '--1']) {
  assert.throws(() => parseCents(bad), TypeError, `parseCents(${JSON.stringify(bad)}) must throw`);
}
assert.equal(formatCents(5), '0.05');
assert.equal(formatCents(-5), '-0.05');
assert.equal(formatCents(123456), '1234.56');

// ---- stable, non-mutating sort ----
{
  const items = Array.from({ length: 24 }, (_, i) => ({ id: i, k: i % 3 }));
  const before = items.map((x) => x.id);
  const asc = sortBy(items, (x) => x.k);
  assert.notEqual(asc, items, 'must return a new array');
  assert.deepEqual(
    items.map((x) => x.id),
    before,
    'input must not be mutated',
  );
  assert.deepEqual(
    asc.map((x) => x.id),
    [0, 3, 6, 9, 12, 15, 18, 21, 1, 4, 7, 10, 13, 16, 19, 22, 2, 5, 8, 11, 14, 17, 20, 23],
  );
  const desc = sortBy(items, (x) => x.k, { descending: true });
  assert.deepEqual(
    desc.map((x) => x.id),
    [2, 5, 8, 11, 14, 17, 20, 23, 1, 4, 7, 10, 13, 16, 19, 22, 0, 3, 6, 9, 12, 15, 18, 21],
  );
}

// ---- report ----
{
  const entries = [
    { date: '2021-01-03', amount: '0.57' }, // 2020-W53
    { date: '2021-01-05', amount: '0.29' }, // 2021-W01
    { date: '2021-01-12', amount: '1.00' }, // 2021-W02
    { date: '2020-12-28', amount: '0.29' }, // 2020-W53
    { date: '2021-01-10', amount: '0.57' }, // 2021-W01
    { date: '2021-01-19', amount: '-0.14' }, // 2021-W03
    { date: '2021-01-13', amount: '0.86' }, // 2021-W02
    { date: '2021-01-20', amount: '2.00' }, // 2021-W03
  ];
  const snapshot = JSON.stringify(entries);
  assert.deepEqual(weeklyReport(entries), [
    { week: '2021-W02', total: '1.86', count: 2 },
    { week: '2021-W03', total: '1.86', count: 2 },
    { week: '2020-W53', total: '0.86', count: 2 },
    { week: '2021-W01', total: '0.86', count: 2 },
  ]);
  assert.equal(JSON.stringify(entries), snapshot);
  assert.deepEqual(weeklyReport([]), []);
}

console.log('week-report: all assertions passed');
