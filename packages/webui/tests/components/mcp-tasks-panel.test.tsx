import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { handlers, client } = vi.hoisted(() => {
  const handlers = new Map<string, (message: unknown) => void>();
  const client = {
    on: vi.fn((type: string, handler: (message: unknown) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    }),
    send: vi.fn((_message: unknown, _options?: unknown) => true),
  };
  return { handlers, client };
});
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ client }) }));

import { MCPTasksPanel } from '../../src/components/SettingsPanel/MCPTasksPanel';
import { i18n } from '../../src/i18n';
import { useConfigStore } from '../../src/stores/config-store';
import { setActiveSessionLane } from '../../src/stores/session-lanes';

const task = {
  id: 'receipt-a',
  server: 'builder',
  tool: 'build',
  status: 'working',
  createdAt: '2026-10-22T00:00:00Z',
  lastUpdatedAt: '2026-10-22T00:00:00Z',
  delivered: false,
  observing: false,
};
function request() {
  return client.send.mock.calls.at(-1)![0] as unknown as {
    type: string;
    payload: { sessionId: string; requestId: string; id?: string };
  };
}
function emit(type: string, payload: object) {
  act(() => handlers.get(type)?.({ type, payload }));
}
function list(tasks: object[] = [task]) {
  emit('mcp.tasks.list', { ...request().payload, tasks });
}
beforeEach(async () => {
  vi.useFakeTimers();
  handlers.clear();
  client.send.mockClear();
  client.send.mockReturnValue(true);
  useConfigStore.setState({ wsConnected: true });
  setActiveSessionLane('tab-a');
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('renders saved tasks, requests recovery and keeps a cancellation acknowledgement nonterminal', () => {
  render(<MCPTasksPanel />);
  list();
  expect(screen.getByText('builder / build')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
  expect(request()).toMatchObject({
    type: 'mcp.tasks.retry',
    payload: { sessionId: 'tab-a', id: 'receipt-a' },
  });
  emit('mcp.tasks.result', { ...request().payload, success: true, message: 'Recovery requested.' });
  list();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));
  expect(request().type).toBe('mcp.tasks.cancel');
  emit('mcp.tasks.result', {
    ...request().payload,
    success: true,
    message: 'Cancellation requested.',
  });
  expect(screen.getByRole('button', { name: 'Cancel requested' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(screen.getByText('Working')).toBeDefined();
  expect(
    client.send.mock.calls.every(
      (call) =>
        (call as unknown[])[1] &&
        ((call as unknown[])[1] as { queueIfDisconnected: boolean }).queueIfDisconnected === false,
    ),
  ).toBe(true);
});
it('clears rows on a tab switch and ignores old or uncorrelated replies', () => {
  render(<MCPTasksPanel />);
  const old = request();
  list();
  act(() => setActiveSessionLane('tab-b'));
  expect(screen.queryByText('builder / build')).toBeNull();
  emit('mcp.tasks.list', { ...old.payload, tasks: [task] });
  expect(screen.queryByText('builder / build')).toBeNull();
  list([]);
  expect(screen.getByText('No saved tasks in this session.')).toBeDefined();
});
it('handles errors, timeouts and reconnects without replaying an action', () => {
  render(<MCPTasksPanel />);
  list();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));
  emit('mcp.tasks.result', { ...request().payload, success: false, message: 'Not available.' });
  expect(screen.getByRole('alert').textContent).toBe('Not available.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel task' }));
  act(() => useConfigStore.setState({ wsConnected: false }));
  expect(screen.getByText('Reconnect to manage tasks.')).toBeDefined();
  act(() => useConfigStore.setState({ wsConnected: true }));
  list();
  expect(screen.getByRole('button', { name: 'Cancel task' }).hasAttribute('disabled')).toBe(false);
  expect(
    client.send.mock.calls.filter(
      (call) => (call as unknown as [{ type: string }])[0].type === 'mcp.tasks.cancel',
    ),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('No confirmation');
});

function startStream() {
  emit('mcp.tasks.list', { ...request().payload, tasks: [task], streaming: true });
  expect(request().type).toBe('mcp.tasks.subscribe');
  const watch = request().payload;
  emit('mcp.tasks.changed', { ...watch, revision: 1, tasks: [task] });
  return watch;
}
it('renders pushed results without polling and rejects duplicate or reversed revisions', () => {
  render(<MCPTasksPanel />);
  const watch = startStream();
  const count = client.send.mock.calls.length;
  act(() => vi.advanceTimersByTime(20_000));
  expect(client.send.mock.calls).toHaveLength(count);
  emit('mcp.tasks.changed', {
    ...watch,
    revision: 3,
    tasks: [{ ...task, status: 'completed', delivered: true }],
  });
  expect(screen.getByText('Completed')).toBeDefined();
  expect(screen.getByText('Result collected')).toBeDefined();
  for (const revision of [3, 2, -1])
    emit('mcp.tasks.changed', { ...watch, revision, tasks: [task] });
  expect(screen.queryByText('Working')).toBeNull();
});
it('unsubscribes on a tab switch and gets a fresh snapshot after reconnecting', () => {
  const rendered = render(<MCPTasksPanel />);
  const old = startStream();
  act(() => setActiveSessionLane('tab-b'));
  expect(
    client.send.mock.calls.some(
      ([m]) => (m as ReturnType<typeof request>).type === 'mcp.tasks.unsubscribe',
    ),
  ).toBe(true);
  emit('mcp.tasks.changed', { ...old, revision: 9, tasks: [task] });
  expect(screen.queryByText('builder / build')).toBeNull();
  const next = startStream();
  act(() => useConfigStore.setState({ wsConnected: false }));
  act(() => useConfigStore.setState({ wsConnected: true }));
  expect(request().type).toBe('mcp.tasks.list');
  startStream();
  emit('mcp.tasks.changed', { ...next, revision: 99, tasks: [] });
  expect(screen.getByText('builder / build')).toBeDefined();
  rendered.unmount();
  expect(request().type).toBe('mcp.tasks.unsubscribe');
  expect(handlers.size).toBe(0);
});
it('falls back to polling after stream failure and retries streaming on manual refresh', () => {
  render(<MCPTasksPanel />);
  const watch = startStream();
  emit('mcp.tasks.result', { ...watch, success: false, message: 'Stream stopped.' });
  expect(screen.getByRole('alert').textContent).toBe('Stream stopped.');
  act(() => vi.advanceTimersByTime(5000));
  expect(request().type).toBe('mcp.tasks.list');
  emit('mcp.tasks.list', { ...request().payload, streaming: true, tasks: [task] });
  expect(request().type).toBe('mcp.tasks.list');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(request().type).toBe('mcp.tasks.subscribe');
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByRole('alert').textContent).toContain('No response');
  expect(
    client.send.mock.calls.some(
      ([m]) => (m as ReturnType<typeof request>).type === 'mcp.tasks.unsubscribe',
    ),
  ).toBe(true);
});
it('pauses a hidden panel and starts a fresh subscription when it becomes visible', () => {
  let visibility: DocumentVisibilityState = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  render(<MCPTasksPanel />);
  const watch = startStream();
  act(() => {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(request().type).toBe('mcp.tasks.unsubscribe');
  const count = client.send.mock.calls.length;
  act(() => vi.advanceTimersByTime(20_000));
  expect(client.send.mock.calls).toHaveLength(count);
  emit('mcp.tasks.changed', { ...watch, revision: 100, tasks: [] });
  expect(screen.getByText('builder / build')).toBeDefined();
  act(() => {
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(request().type).toBe('mcp.tasks.subscribe');
  expect(request().payload.requestId).not.toBe(watch.requestId);
});
