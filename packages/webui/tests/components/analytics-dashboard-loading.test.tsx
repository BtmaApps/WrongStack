import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyticsDashboard } from '../../src/components/AnalyticsDashboard';

vi.mock('@/i18n', () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({ on: () => () => {}, getStats: () => {} }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('renders the dashboard after the initial loading state without changing hook order', async () => {
  vi.useFakeTimers();
  let finishRequests!: () => void;
  const response = new Promise<Response>((resolve) => {
    finishRequests = () => resolve(new Response(null, { status: 503 }));
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response),
  );
  render(<AnalyticsDashboard />);
  expect(screen.getByText('activity:analytics.loading')).toBeTruthy();
  await act(async () => {
    finishRequests();
    await response;
  });
  expect(screen.getByText('activity:analytics.heading')).toBeTruthy();
  expect(screen.queryByText('activity:analytics.loading')).toBeNull();
});
