const defaultKey = (...args) => String(args[0]);

/**
 * Memoize an async function by key. Concurrent calls with the same key share
 * one in-flight promise.
 *
 * @template R
 * @param {(...args: any[]) => Promise<R>} fn
 * @param {{ key?: (...args: any[]) => string }} [options]
 */
export function memoizeAsync(fn, options = {}) {
  const keyOf = options.key ?? defaultKey;
  const cache = {};

  function memoized(...args) {
    const key = keyOf(...args);
    if (cache[key]) return cache[key];
    const promise = Promise.resolve().then(() => fn(...args));
    cache[key] = promise;
    return promise;
  }

  memoized.clear = (key) => {
    if (key === undefined) {
      for (const k of Object.keys(cache)) delete cache[k];
    } else {
      delete cache[key];
    }
  };

  return memoized;
}
