// @vitest-environment jsdom
/**
 * W4 #7/#19 — the Cockpit command-latency card.
 *
 * The card is a pure function of `HqCommandLatencySummary`, so these tests pin
 * the boundary that matters most: an unacked command has NO latency, and the
 * card must render the empty state rather than a zeroed row. A `0 ms` read-out
 * for "nobody has acked anything yet" is the failure mode this suite exists to
 * prevent — it looks like a perfectly healthy round-trip.
 *
 * @module tests/cockpit-latency
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The card itself reads no state, but importing the cockpit executes its
// module-level imports — including the HTTP client, which would otherwise pull
// in the auth store and its side effects.
vi.mock('../../../src/data/api.js', () => ({
  fetchJson: vi.fn(),
  postCommand: vi.fn(),
}));

import { CommandLatencyCard } from '../cockpit.js';

afterEach(() => {
  cleanup();
});

describe('CommandLatencyCard (W4 #7/#19)', () => {
  it('renders the empty state when no summary has arrived', () => {
    render(<CommandLatencyCard latency={undefined} />);
    expect(screen.getByText('No acknowledged commands yet')).toBeTruthy();
  });

  it('renders the empty state — not 0 ms — when nothing has been acked', () => {
    // The load-bearing case: a zeroed sample would read as a healthy
    // round-trip when in fact no command has completed yet.
    render(<CommandLatencyCard latency={{ sampleCount: 0 }} />);
    expect(screen.getByText('No acknowledged commands yet')).toBeTruthy();
    expect(screen.queryByText(/0 ms/)).toBeNull();
  });

  it('renders the three percentiles', () => {
    render(<CommandLatencyCard latency={{ sampleCount: 12, p50Ms: 42, p95Ms: 310, p99Ms: 900 }} />);
    expect(screen.getByText('42 ms')).toBeTruthy();
    expect(screen.getByText('310 ms')).toBeTruthy();
    expect(screen.getByText('900 ms')).toBeTruthy();
  });

  it('renders a percentile at or above one second in seconds', () => {
    render(<CommandLatencyCard latency={{ sampleCount: 3, p50Ms: 2500 }} />);
    expect(screen.getByText('2.50 s')).toBeTruthy();
  });

  it('renders an em dash for a percentile the sample could not produce', () => {
    // Nearest-rank percentiles are undefined for small samples; a missing p99
    // must not render as 0 ms.
    render(<CommandLatencyCard latency={{ sampleCount: 1, p50Ms: 5 }} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('reports the sample count and the max', () => {
    render(<CommandLatencyCard latency={{ sampleCount: 7, p50Ms: 10, maxMs: 1200 }} />);
    expect(screen.getByText('7 acked')).toBeTruthy();
    expect(screen.getByText(/max 1\.20 s/)).toBeTruthy();
  });
});
