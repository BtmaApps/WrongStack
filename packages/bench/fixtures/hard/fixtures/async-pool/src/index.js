import { memoizeAsync } from './memo.js';
import { mapLimit } from './pool.js';

export { mapLimit, memoizeAsync };

/**
 * Fetch every id through a memoized loader with bounded concurrency.
 *
 * @param {string[]} ids
 * @param {(id: string) => Promise<unknown>} load
 * @param {number} [concurrency]
 */
export function createFetcher(load, concurrency = 4) {
  const cached = memoizeAsync(load);
  return {
    fetchAll: (ids) => mapLimit(ids, concurrency, (id) => cached(id)),
    forget: (id) => cached.clear(id),
  };
}
