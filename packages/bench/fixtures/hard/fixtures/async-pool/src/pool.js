/**
 * Run `fn` over `items` with at most `limit` calls in flight.
 * Resolves with the results in input order.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R> | R} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimit(items, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer');
  }
  const results = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const item = items[next];
      const value = await fn(item, next);
      results.push(value);
      next++;
    }
  }

  const workers = [];
  const count = Math.min(limit, items.length);
  for (let w = 0; w <= count; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
