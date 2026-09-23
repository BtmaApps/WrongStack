// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServerOutage } from '../src/hooks/use-server-outage.js';
import {
  OUTAGE_GRACE_MS,
  OUTAGE_PROBE_INTERVAL_MS,
  probeServer,
} from '../src/lib/server-health.js';
import type { ConnectionState } from '../src/types.js';

vi.mock('../src/lib/server-health.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/server-health.js')>();
  return { ...actual, probeServer: vi.fn() };
});

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('useServerOutage — unmount probe chain', () => {
  it('stops the probe chain when the component unmounts mid-probe', async () => {
    vi.useFakeTimers();
    const mockedProbe = vi.mocked(probeServer);
    let resolveProbe: (value: 'reachable' | 'unreachable') => void = () => {};
    mockedProbe.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    );

    function Probe(): null {
      useServerOutage('closed' as ConnectionState);
      return null;
    }

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<Probe />));

    // Grace elapses → the first probe starts and stays in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTAGE_GRACE_MS);
    });
    expect(mockedProbe).toHaveBeenCalledTimes(1);

    // Unmount while the probe is still pending.
    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);

    // The in-flight probe resolves AFTER teardown.
    await act(async () => {
      resolveProbe('reachable');
    });

    // Far beyond one re-probe interval: the chain must be dead. The old
    // cleanup only cleared the timer, so the resolving probe re-armed a
    // new one that nothing owned — the chain probed forever.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTAGE_PROBE_INTERVAL_MS * 3);
    });
    expect(mockedProbe).toHaveBeenCalledTimes(1);
  });
});
