import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMailboxStore } from '../../src/stores/mailbox-store.js';

type Handler = (message: { type: string; payload: unknown }) => void;
const handlers = new Map<string, Set<Handler>>();
const sends: Array<{ type: string; payload?: unknown }> = [];

const client = {
  status: { state: 'open' },
  onStatus(handler: (status: { state: string }) => void) {
    handler({ state: 'open' });
    return () => undefined;
  },
  on(type: string, handler: Handler) {
    const registered = handlers.get(type) ?? new Set<Handler>();
    registered.add(handler);
    handlers.set(type, registered);
    return () => registered.delete(handler);
  },
  send(message: { type: string; payload?: unknown }) {
    sends.push(message);
  },
};

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ client }),
}));

import { MailboxPanel } from '../../src/components/MailboxPanel.js';

const message = {
  id: 'mail-1',
  from: 'worker-a1b2c3d4',
  to: 'leader',
  type: 'note',
  subject: 'Checkpoint',
  body: 'Halfway done',
  priority: 'normal',
  readBy: {},
  readByCount: 0,
  completed: false,
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  handlers.clear();
  sends.length = 0;
  useMailboxStore.setState({
    messages: [],
    agents: [],
    lastCompaction: null,
    listStatus: 'loading',
    listError: null,
  });
});

describe('MailboxPanel list state branches', () => {
  it('renders skeleton rows while the list query is in flight', () => {
    render(<MailboxPanel />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading mailbox messages…')).toBeTruthy(); // sr-only
    expect(screen.queryByText('No messages yet.')).toBeNull();
  });

  it('renders the empty state once the query resolved with no messages', () => {
    render(<MailboxPanel />);
    act(() => {
      useMailboxStore.setState({ listStatus: 'ready' });
    });
    expect(screen.getByText('No messages yet.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a friendly error with a focusable retry button on list-load failure', () => {
    render(<MailboxPanel />);
    act(() => {
      useMailboxStore.setState({ listStatus: 'error', listError: 'mailbox query timed out' });
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Could not load the mailbox list.');
    expect(alert.textContent).toContain('mailbox query timed out');

    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeTruthy();
    expect(retry.getAttribute('tabindex')).not.toBe('-1');
    sends.length = 0; // drop the initial mount query so only the retry counts
    fireEvent.click(retry);

    expect(sends.filter((sent) => sent.type === 'mailbox.messages')).toHaveLength(1);
    expect(useMailboxStore.getState().listStatus).toBe('loading');
  });

  it('renders message rows on success', () => {
    render(<MailboxPanel />);
    act(() => {
      useMailboxStore.setState({ listStatus: 'ready', messages: [message] });
    });
    expect(screen.getByText('Checkpoint')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
