/**
 * Sort `items` by the numeric key returned from `keyFn`.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} keyFn
 * @param {{ descending?: boolean }} [options]
 * @returns {T[]}
 */
export function sortBy(items, keyFn, { descending = false } = {}) {
  const dir = descending ? -1 : 1;
  quicksort(items, 0, items.length - 1, (a, b) => dir * (keyFn(a) - keyFn(b)));
  return items;
}

function quicksort(arr, lo, hi, cmp) {
  if (lo >= hi) return;
  const pivot = arr[Math.floor((lo + hi) / 2)];
  let i = lo;
  let j = hi;
  while (i <= j) {
    while (cmp(arr[i], pivot) < 0) i++;
    while (cmp(arr[j], pivot) > 0) j--;
    if (i <= j) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
      j--;
    }
  }
  quicksort(arr, lo, j, cmp);
  quicksort(arr, i, hi, cmp);
}
