/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postCommand } from '../../src/data/api.js';
import { useHqStore } from '../../src/data/store/index.js';
import { CockpitView } from '../../src/views/cockpit.js';
import { commandEntry, liveSnapshot, snapshotWithClient } from '../fixtures/hq.js';

vi.mock('../../src/data/api.js', () => ({
  fetchJson: vi.fn(() => Promise.reject(new Error('offline'))),
  postCommand: vi.fn(() => Promise.resolve({ commandId: 'sent-1', queued: true })),
}));

beforeEach(() => {
  useHqStore.setState({
    snapshot: snapshotWithClient('client-1'),
    alerts: [],
    events: [],
    commandStatuses: [],
    connected: true,
    selectedClientId: null,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Cockpit operator actions', () => {
  it('shows blocked agents, lost clients and failed commands as actionable signals', () => {
    const next = liveSnapshot('session-1', ['agent-1']);
    next.liveSessions![0]!.agents[0]!.status = 'waiting_user';
    next.clients = [{ ...snapshotWithClient('lost-1').clients[0]!, connected: false }];
    useHqStore.setState({
      snapshot: next,
      commandStatuses: [commandEntry('bad-1', { ackStatus: 'failed' })],
    });
    render(<CockpitView />);
    expect(screen.getByTestId('cockpit-hero')).toHaveAttribute('data-tone', 'attention');
    expect(screen.getByRole('button', { name: 'Blocked or errored agents 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Disconnected clients 1' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Failed commands 1' }));
    expect(useHqStore.getState().activeView).toBe('control');
  });

  it('dispatches a quick action to the explicitly selected client', async () => {
    const next = snapshotWithClient('client-1');
    next.clients[0]!.capabilities = ['control.receive'];
    next.clients = [
      ...next.clients,
      { ...next.clients[0]!, clientId: 'client-2', hostname: 'Second machine' },
    ];
    useHqStore.setState({ snapshot: next });
    render(<CockpitView />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Quick action target' }), {
      target: { value: 'client-2' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request fleet status' }));
    });
    expect(postCommand).toHaveBeenCalledWith(
      'client-2',
      'broadcast',
      expect.objectContaining({ priority: 'normal' }),
    );
  });

  it('requires choosing a new target when the selected client disappears', () => {
    const next = snapshotWithClient('client-1');
    next.clients[0]!.capabilities = ['control.receive'];
    useHqStore.setState({ snapshot: next, selectedClientId: 'removed-client' });
    render(<CockpitView />);
    expect(screen.getByRole('combobox', { name: 'Quick action target' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Request fleet status' })).toBeDisabled();
    expect(postCommand).not.toHaveBeenCalled();
  });
});
