// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConnectionsHealthReport } from '../src/connections-health.js';
import { useSidebarConnections } from '../src/hooks/use-sidebar-panel-data.js';

const { collect } = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('@wrongstack/tools', () => ({ getProcessRegistry: vi.fn() }));
vi.mock('../src/connections-health.js', () => ({ collectConnectionsHealth: collect }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  collect.mockReset();
});
const report: ConnectionsHealthReport = {
  checkedAt: 1,
  overall: 'healthy',
  services: [
    {
      id: 'sage',
      label: 'SAGE',
      status: 'healthy',
      required: false,
      mode: 'ipc',
      detail: '',
    },
  ],
};

it('does not poll while hidden and preserves service identity/status when enabled', async () => {
  collect.mockResolvedValue(report);
  const view = renderHook(({ enabled }) => useSidebarConnections('/a', enabled), {
    initialProps: { enabled: false },
  });
  expect(collect).not.toHaveBeenCalled();
  view.rerender({ enabled: true });
  await waitFor(() =>
    expect(view.result.current[0]).toMatchObject({
      id: 'sage',
      healthStatus: 'healthy',
      status: 'ok',
    }),
  );
  view.rerender({ enabled: false });
  expect(view.result.current).toEqual([]);
});

it('clears old project status immediately and ignores its late response', async () => {
  let finish!: (value: ConnectionsHealthReport) => void;
  collect
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ ...report, services: [] });
  const view = renderHook(({ root }) => useSidebarConnections(root), {
    initialProps: { root: '/a' },
  });
  await waitFor(() => expect(collect).toHaveBeenCalledWith('/a'));
  view.rerender({ root: '/b' });
  expect(view.result.current).toEqual([]);
  await waitFor(() => expect(collect).toHaveBeenCalledWith('/b'));
  await act(async () => {
    finish(report);
  });
  expect(view.result.current).toEqual([]);
});

it('does not overlap slow probes and cancels refresh on unmount', async () => {
  let finish!: (value: ConnectionsHealthReport) => void;
  collect.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderHook(() => useSidebarConnections('/a'));
  await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(24_000);
  });
  expect(collect).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(report);
  });
  view.unmount();
  await vi.advanceTimersByTimeAsync(24_000);
  expect(collect).toHaveBeenCalledTimes(1);
});
