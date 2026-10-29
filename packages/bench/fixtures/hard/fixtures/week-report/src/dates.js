const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO-8601 week of a calendar date given as 'YYYY-MM-DD'.
 * @returns {{ year: number, week: number }}
 */
export function isoWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  // Move to the Thursday of the same ISO week.
  const thursday = new Date(date.getTime() + (4 - day) * DAY_MS);
  const yearStart = Date.UTC(y, 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { year: y, week };
}

/** 'YYYY-Www' key for a date, e.g. '2021-W05'. */
export function weekKey(dateStr) {
  const { year, week } = isoWeek(dateStr);
  return `${year}-W${week}`;
}
