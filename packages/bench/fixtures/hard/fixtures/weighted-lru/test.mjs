import assert from 'node:assert/strict';
import { WeightedLRU } from './src/lru.js';

// HARD_SENTINEL_weighted-lru

let t = 1000;
const now = () => t;
let events = [];
const onEvict = (key, value, reason) => events.push(`${reason}:${key}=${value}`);
const make = (maxWeight, ttlMs = 100) => {
  events = [];
  return new WeightedLRU({ maxWeight, ttlMs, now, onEvict });
};

// Constructor and argument validation.
assert.throws(() => new WeightedLRU({ maxWeight: 0, ttlMs: 10, now }), RangeError);
assert.throws(() => new WeightedLRU({ maxWeight: 5, ttlMs: 0, now }), RangeError);
{
  const c = make(10);
  assert.throws(() => c.set('a', 1, 0), TypeError);
  assert.throws(() => c.set('a', 1, -2), TypeError);
  assert.throws(() => c.set('a', 1, Number.POSITIVE_INFINITY), TypeError);
  assert.throws(() => c.set('a', 1, '3'), TypeError);
}

// Capacity eviction by weight, LRU first; get refreshes recency, peek/has do not.
{
  const c = make(10);
  assert.equal(c.set('a', 'A', 4), true);
  assert.equal(c.set('b', 'B', 4), true);
  assert.equal(c.get('a'), 'A'); // a is now MRU
  assert.equal(c.peek('b'), 'B'); // peek does not touch recency
  assert.equal(c.has('b'), true);
  assert.deepEqual(c.keys(), ['a', 'b']);
  assert.equal(c.set('c', 'C', 4), true); // 12 > 10 -> evict LRU 'b'
  assert.deepEqual(events, ['capacity:b=B']);
  assert.deepEqual(c.keys(), ['c', 'a']);
  assert.equal(c.totalWeight, 8);
  assert.equal(c.size, 2);
  // A heavy item may evict several entries; the new entry itself is never evicted.
  assert.equal(c.set('d', 'D', 9), true);
  assert.deepEqual(events, ['capacity:b=B', 'capacity:a=A', 'capacity:c=C']);
  assert.deepEqual(c.keys(), ['d']);
}

// Replacing a key: no onEvict, weight updated, becomes MRU, TTL restarts.
{
  t = 1000;
  const c = make(10);
  c.set('a', 1, 3);
  c.set('b', 2, 3);
  t = 1050;
  c.set('a', 11, 6);
  assert.deepEqual(events, []);
  assert.equal(c.totalWeight, 9);
  assert.deepEqual(c.keys(), ['a', 'b']);
  t = 1100; // b expires exactly at insertion + ttl; a was re-set at 1050
  assert.equal(c.get('b'), undefined);
  assert.deepEqual(events, ['expired:b=2']);
  assert.equal(c.get('a'), 11);
}

// Oversized set is rejected and removes any existing entry for that key, silently.
{
  const c = make(5);
  c.set('a', 'old', 2);
  c.set('z', 'Z', 1);
  assert.equal(c.set('a', 'huge', 6), false);
  assert.equal(c.has('a'), false);
  assert.deepEqual(events, []);
  assert.equal(c.totalWeight, 1);
  assert.equal(c.set('w', 'W', 5), true); // exactly maxWeight fits
  assert.deepEqual(events, ['capacity:z=Z']);
}

// get does NOT extend TTL.
{
  t = 0;
  const c = make(10, 100);
  c.set('a', 'A');
  t = 60;
  assert.equal(c.get('a'), 'A');
  t = 99;
  assert.equal(c.get('a'), 'A');
  t = 100;
  assert.equal(c.get('a'), undefined);
  assert.deepEqual(events, ['expired:a=A']);
}

// Expired entries are purged (LRU -> MRU order) before any capacity eviction.
{
  t = 0;
  const c = make(10, 100);
  c.set('old1', 1, 3);
  c.set('old2', 2, 3);
  t = 50;
  c.set('live', 3, 3);
  t = 120; // old1, old2 expired; live still valid
  assert.equal(c.set('new', 4, 5), true);
  assert.deepEqual(events, ['expired:old1=1', 'expired:old2=2']);
  assert.deepEqual(c.keys(), ['new', 'live']);
  assert.equal(c.totalWeight, 8);
}

// size, totalWeight and keys() purge expired entries; delete semantics.
{
  t = 0;
  const c = make(10, 100);
  c.set('a', 'A', 2);
  t = 10;
  c.set('b', 'B', 3);
  t = 105;
  assert.equal(c.size, 1);
  assert.deepEqual(events, ['expired:a=A']);
  assert.equal(c.totalWeight, 3);
  assert.equal(c.delete('b'), true);
  assert.equal(c.delete('b'), false);
  assert.deepEqual(events, ['expired:a=A']);
  c.set('x', 'X', 1);
  t = 205;
  assert.equal(c.delete('x'), false); // expired: removed, reported, but not a live delete
  assert.deepEqual(events, ['expired:a=A', 'expired:x=X']);
  assert.equal(c.size, 0);
}

// has() on an expired key reports it and returns false; works without onEvict.
{
  t = 0;
  const c = make(10, 100);
  c.set('k', 'K');
  t = 100;
  assert.equal(c.has('k'), false);
  assert.deepEqual(events, ['expired:k=K']);
  const quiet = new WeightedLRU({ maxWeight: 2, ttlMs: 5, now });
  quiet.set('a', 1);
  quiet.set('b', 2);
  quiet.set('c', 3);
  assert.deepEqual(quiet.keys(), ['c', 'b']);
}

console.log('weighted-lru: all assertions passed');
