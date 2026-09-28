export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  // `Math.max` PROPAGATES NaN, so a non-finite `concurrency` would defeat the
  // floor below: `Array.from({ length: NaN })` produces ZERO workers,
  // `Promise.all([])` resolves immediately, and the mapper is never called —
  // every slot of `results` is left as a hole. A caller that computed
  // `concurrency` from an unvalidated config or divide result would silently
  // get an array of `undefined` instead of results.
  //
  // So a non-finite limit is REJECTED and replaced with the one-worker floor,
  // not propagated: the mapper still runs over every item and the caller still
  // gets real results, just serially. A zero/negative limit is already handled
  // by the same floor below.
  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
