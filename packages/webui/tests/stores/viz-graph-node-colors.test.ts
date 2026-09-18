/**
 * Every `VizNode['kind']` must have a `NODE_COLORS` entry, and no node-building
 * site may depend on the producer having set `event.color`.
 *
 * `VizNode['kind']` has always included `'coordinator'` and `inferKind` returns
 * it for a target whose event source is `leader`/`coordinator` — but
 * `NODE_COLORS` had no `coordinator` entry. `NODE_COLORS` is a
 * `Record<string, string>`, so nothing in the type system objected. It stayed
 * invisible only because the `viz-pipeline` producers happen to set an explicit
 * `color`, which short-circuits the lookup; a producer that omits it (the type
 * allows it) built a node with `color: undefined`.
 *
 * The edge-building site already had a `?? NODE_COLORS.agent` fallback. The two
 * node sites did not — that inconsistency is what exposed the gap, and these
 * tests pin both halves of the fix.
 */
import { describe, expect, it } from 'vitest';
import { applyEventToGraph, inferKind } from '../../src/stores/viz-graph-helpers';
import {
  NODE_COLORS,
  type VizEvent,
  type VizNode,
  type VizState,
} from '../../src/stores/viz-types';

/** Every kind the `VizNode['kind']` union declares. */
const DECLARED_KINDS: ReadonlyArray<VizNode['kind']> = [
  'provider',
  'agent',
  'tool',
  'mailbox',
  'session',
  'system',
  'error',
  'coordinator',
];

function emptyState(): VizState {
  return { events: [], nodes: new Map(), edges: new Map(), isActive: false } as unknown as VizState;
}

/** A leader-sourced event with a target and NO explicit colour. */
function colourlessLeaderEvent(over: Partial<VizEvent> = {}): VizEvent {
  return {
    id: 'e1',
    kind: 'agent:status',
    timestamp: 0,
    source: 'leader',
    target: 'worker-1',
    label: 'delegating',
    magnitude: 1,
    ...over,
  } as VizEvent;
}

describe('NODE_COLORS covers the VizNode kind union', () => {
  it.each(DECLARED_KINDS)('has an entry for %s', (kind) => {
    expect(NODE_COLORS[kind], `NODE_COLORS is missing "${kind}"`).toBeTruthy();
  });
});

describe('applyEventToGraph node colours', () => {
  it('classifies a leader-sourced target as coordinator', () => {
    expect(inferKind(colourlessLeaderEvent(), true)).toBe('coordinator');
  });

  it('gives that coordinator node a real colour when the event carries none', () => {
    const { nodes } = applyEventToGraph(emptyState(), colourlessLeaderEvent(), 1_000);
    const target = nodes.get('worker-1');
    expect(target?.kind).toBe('coordinator');
    expect(target?.color).toBe(NODE_COLORS.coordinator);
  });

  it('leaves no node without a colour', () => {
    const { nodes } = applyEventToGraph(emptyState(), colourlessLeaderEvent(), 1_000);
    expect(nodes.size).toBeGreaterThan(0);
    for (const node of nodes.values()) {
      expect(node.color, `node ${node.id} (${node.kind}) has no colour`).toBeTruthy();
    }
  });

  it('still honours an explicit colour on the event', () => {
    const { nodes } = applyEventToGraph(
      emptyState(),
      colourlessLeaderEvent({ color: 'rebeccapurple' } as Partial<VizEvent>),
      1_000,
    );
    expect(nodes.get('worker-1')?.color).toBe('rebeccapurple');
  });
});
