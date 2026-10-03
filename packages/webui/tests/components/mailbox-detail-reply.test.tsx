import { fireEvent, render, screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type MailboxMessage, useMailboxStore } from '../../src/stores/mailbox-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';

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

import { MailboxDetailView } from '../../src/components/MailboxDetailView.js';
import { MailboxPanel } from '../../src/components/MailboxPanel.js';

const inbound: MailboxMessage = {
  id: 'mail-0002',
  from: 'reviewer-c4d5e6f7',
  to: 'leader',
  type: 'ask',
  subject: 'Deploy window?',
  body: 'Can I deploy now?',
  priority: 'normal',
  readBy: {},
  readByCount: 0,
  completed: false,
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  handlers.clear();
  sends.length = 0;
  useMailboxStore.setState({ messages: [inbound], agents: [], lastCompaction: null });
  useUIStore.setState({ selectedMailMessage: inbound, mailboxComposeRequest: null });
});

describe('MailboxDetailView reply', () => {
  it('opens the compose dialog threaded via the shared prefill request', () => {
    // MailboxPanel must be mounted: it owns the dialog the detail view's
    // Reply targets through the ui-store compose request.
    render(
      <Suspense fallback={null}>
        <MailboxPanel />
        <div data-testid="detail">
          <MailboxDetailView />
        </div>
      </Suspense>,
    );

    // The panel's message rows carry their own Reply buttons — scope to the
    // detail view so the right surface is exercised.
    fireEvent.click(within(screen.getByTestId('detail')).getByRole('button', { name: 'Reply' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('reviewer-c4d5e6f7')).toBeTruthy();
    expect(screen.getByDisplayValue('Re: Deploy window?')).toBeTruthy();
    // The dialog indicator truncates the id to 8 chars for display; the
    // payload below must still carry the FULL id.
    expect(screen.getByText(/in reply to: mail-000/i)).toBeTruthy();
    // Request consumed exactly once — no stale request left to re-fire.
    expect(useUIStore.getState().mailboxComposeRequest).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'After 5pm' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const sent = sends.find((message) => message.type === 'mailbox.send');
    expect(sent?.payload).toMatchObject({
      to: 'reviewer-c4d5e6f7',
      type: 'note',
      subject: 'Re: Deploy window?',
      body: 'After 5pm',
      replyTo: 'mail-0002',
    });
  });
});
