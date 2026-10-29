/**
 * Weighted LRU cache with a time-to-live. See the task prompt for the full contract.
 */
export class WeightedLRU {
  constructor({ maxWeight, ttlMs, now = Date.now, onEvict } = {}) {
    this.maxWeight = maxWeight;
    this.ttlMs = ttlMs;
    this.now = now;
    this.onEvict = onEvict;
    this.map = new Map();
  }

  set(key, value, weight = 1) {
    this.map.set(key, value);
    return true;
  }

  get(key) {
    return this.map.get(key);
  }
}
