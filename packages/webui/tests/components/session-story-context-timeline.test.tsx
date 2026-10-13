import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextTimeline } from '../../src/components/session-story/ContextTimeline';
import type { ChronicleEventView } from '../../src/types';

afterEach(cleanup);

function event(eventType: string, at: number, attributes: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    eventId: `${eventType}-${at}`,
    eventType,
    occurredAt: new Date(at).toISOString(),
    observedAt: new Date(at).toISOString(),
    persistedAt: new Date(at).toISOString(),
    sequence: at,
    hash: '',
    previousHash: '',
    scope: { sessionId: 's1' },
    correlation: {},
    attributes,
  } satisfies ChronicleEventView;
}

const point = (at: number, seq: number, verdict = 'hit', breakers: string[] = []) =>
  event('context.residency', at, {
    agentId: 'leader',
    seq,
    provider: 'anthropic',
    model: 'opus',
    mechanism: 'explicit',
    maxContext: 200_000,
    total: 30_000,
    cached: 24_000,
    written: 4_000,
    uncached: 2_000,
    usageInput: 1_000,
    usageCacheRead: 26_000,
    usageCacheWrite: 4_000,
    verdict,
    breakers,
    segments: [
      { kind: 'system', tokens: 6_000, lane: 'cached', count: 2 },
      { kind: 'live-tail', tokens: 2_000, lane: 'uncached', count: 3 },
    ],
    live: [{ source: 'memory-evidence', tokens: 2_000 }],
    historyMessages: 4,
  });

describe('ContextTimeline', () => {
  it('draws provider-reported cache reads even when layout predicted no reusable prefix', () => {
    const { container } = render(
      <ContextTimeline
        events={[
          event('context.residency', 1_000, {
            ...point(1_000, 1).attributes,
            mechanism: 'none',
            cached: 0,
            written: 0,
            uncached: 30_000,
            usageInput: 4_000,
            usageCacheRead: 26_000,
            usageCacheWrite: 0,
          }),
        ]}
      />,
    );
    expect(container.querySelector('svg rect[fill="hsl(var(--success))"]')).not.toBeNull();
  });

  it('shows an honest empty state without residency events', () => {
    render(<ContextTimeline events={[]} />);
    expect(screen.getByText(/No context data yet/)).toBeTruthy();
  });

  it('charts requests, lists in/out in the ledger and inspects a selected request', () => {
    render(
      <ContextTimeline
        events={[
          point(1_000, 1, 'cold'),
          event('compaction.fired', 2_000, {
            report: {
              before: 40_000,
              after: 18_000,
              reductions: [{ phase: 'elide', saved: 22_000 }],
            },
          }),
          point(3_000, 2, 'miss', ['history']),
        ]}
      />,
    );
    expect(screen.getByText('Context window over time')).toBeTruthy();
    expect(screen.getAllByText(/\+6\.0k in|\+2\.0k in/).length).toBeGreaterThan(0);
    expect(screen.getByText(/−22\.0k out/)).toBeTruthy();
    expect(screen.getByText(/elide −22,000/)).toBeTruthy();
    // Latest request is focused by default: its verdict and breaker show.
    expect(screen.getAllByText(/Miss — nothing was read from cache/).length).toBeGreaterThan(0);
    expect(screen.getByText(/History rewritten/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /#1 ·/ }));
    expect(screen.getAllByText(/Cold start/).length).toBeGreaterThan(0);
    expect(screen.getByText(/memory-evidence/)).toBeTruthy();
  });
});
