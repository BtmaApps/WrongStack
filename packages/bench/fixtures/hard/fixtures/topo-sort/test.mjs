import assert from 'node:assert/strict';
import { CycleError, topoSort } from './src/topo.js';

// HARD_SENTINEL_topo-sort

function cycleOf(graph) {
  try {
    topoSort(graph);
  } catch (err) {
    assert.ok(err instanceof CycleError, `expected CycleError, got ${err}`);
    assert.ok(err instanceof Error);
    assert.equal(err.message, `Cycle detected: ${err.cycle.join(' -> ')}`);
    return err.cycle;
  }
  assert.fail('expected a CycleError');
}

// Simple chain and empty graph.
assert.deepEqual(topoSort({}), []);
assert.deepEqual(topoSort({ app: ['lib'], lib: ['core'], core: [] }), ['core', 'lib', 'app']);

// Nodes that only appear as dependencies are included; ties broken lexicographically.
assert.deepEqual(topoSort({ b: [], a: [], c: ['z'] }), ['a', 'b', 'z', 'c']);

// Diamond: shared dependency is not a cycle.
assert.deepEqual(topoSort({ top: ['left', 'right'], left: ['base'], right: ['base'], base: [] }), [
  'base',
  'left',
  'right',
  'top',
]);

// Duplicate dependencies are ignored.
assert.deepEqual(topoSort({ a: ['b', 'b', 'b'], b: [] }), ['b', 'a']);

// Lexicographic string order, not numeric order and not object key order.
assert.deepEqual(topoSort({ 9: [], 10: [], x: ['9'] }), ['10', '9', 'x']);

// Kahn picks the smallest READY node each step, even if it becomes ready late.
assert.deepEqual(topoSort({ a: ['m'], m: [], b: [] }), ['b', 'm', 'a']);

// Input must not be mutated.
const input = { a: ['c', 'b'], b: [], c: [] };
const snapshot = JSON.stringify(input);
assert.deepEqual(topoSort(input), ['b', 'c', 'a']);
assert.equal(JSON.stringify(input), snapshot);

// Cycles.
assert.deepEqual(cycleOf({ a: ['b'], b: ['a'] }), ['a', 'b', 'a']);
assert.deepEqual(cycleOf({ x: ['x'] }), ['x', 'x']);
// The cycle does not include the node that merely leads into it.
assert.deepEqual(cycleOf({ a: ['b'], b: ['c'], c: ['d'], d: ['b'] }), ['b', 'c', 'd', 'b']);
// Cross edge to an already-finished node (a -> c, b -> c) is not a cycle; the real cycle is later.
assert.deepEqual(cycleOf({ a: ['c'], b: ['c', 'e'], c: [], e: ['f'], f: ['e'] }), ['e', 'f', 'e']);
// Dependencies are explored in ascending order, so the first back edge found is via 'c', not 'd'.
assert.deepEqual(cycleOf({ a: ['b'], b: ['d', 'c'], c: ['a'], d: ['b'] }), ['a', 'b', 'c', 'a']);
// A cycle is reported even if other parts of the graph could be ordered.
assert.deepEqual(cycleOf({ ok: [], p: ['q'], q: ['r'], r: ['p'] }), ['p', 'q', 'r', 'p']);

console.log('topo-sort: all assertions passed');
