import { weekKey } from './dates.js';
import { formatCents, parseCents } from './money.js';
import { sortBy } from './sort.js';

/**
 * Group ledger entries by ISO week.
 * @param {{ date: string, amount: string }[]} entries
 * @returns {{ week: string, total: string, count: number }[]}
 */
export function weeklyReport(entries) {
  const byWeek = new Map();
  for (const entry of entries) {
    const key = weekKey(entry.date);
    const row = byWeek.get(key) ?? { week: key, cents: 0, count: 0 };
    row.cents += parseCents(entry.amount);
    row.count += 1;
    byWeek.set(key, row);
  }
  const rows = sortBy([...byWeek.values()], (row) => row.cents, { descending: true });
  return rows.map((row) => ({ week: row.week, total: formatCents(row.cents), count: row.count }));
}
