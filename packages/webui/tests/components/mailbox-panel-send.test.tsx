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

beforeEach(() => {
  handlers.clear();
  sends.length = 0;
  useMailboxStore.setState({ messages: [], agents: [], lastCompaction: null });
});

describe('MailboxPanel composer', () => {
  it('sends an explicit leaders-only WebUI mailbox message', () => {
    render(<MailboxPanel />);
    fireEvent.click(screen.getByRole('button', { name: /compose message/i }));

    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'leaders' } });
    fireEvent.change(screen.getByPlaceholderText('Subject (optional)'), {
      target: { value: 'Review result' },
    });
    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'No findings' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const sent = sends.find((message) => message.type === 'mailbox.send');
    expect(sent?.payload).toMatchObject({
      to: 'leader',
      type: 'note',
      audience: 'leaders',
      subject: 'Review result',
      body: 'No findings',
      priority: 'normal',
    });
    expect(screen.getByText(/only leader agents/i)).toBeTruthy();
  });

  it('shows the correlated server acknowledgement', () => {
    render(<MailboxPanel />);
    fireEvent.click(screen.getByRole('button', { name: /compose message/i }));
    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'Milestone' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const request = sends.find((message) => message.type === 'mailbox.send');
    const requestId = (request?.payload as { requestId?: string } | undefined)?.requestId;
    expect(requestId).toBeDefined();
    act(() => {
      for (const handler of handlers.get('mailbox.sent') ?? []) {
        handler({
          type: 'mailbox.sent',
          payload: { requestId, success: true, messageId: 'message-123456' },
        });
      }
    });

    expect(screen.getByText(/sent · message-/i)).toBeTruthy();
  });

  it('targets an agent picked from the compose roster', () => {
    useMailboxStore.setState({
      agents: [
        {
          agentId: 'worker-a1b2c3d4',
          name: 'Parser Worker',
          role: 'executor',
          sessionId: 'sess-1',
          status: 'running',
          currentTool: 'bash',
          lastSeenAt: new Date().toISOString(),
          online: true,
        },
      ],
    });
    render(<MailboxPanel />);
    fireEvent.click(screen.getByRole('button', { name: /compose message/i }));

    fireEvent.click(screen.getByRole('button', { name: /worker-a1b2c3d4/i }));
    expect(screen.getByDisplayValue('worker-a1b2c3d4')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'Run the parser tests' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const sent = sends.find((message) => message.type === 'mailbox.send');
    expect(sent?.payload).toMatchObject({
      to: 'worker-a1b2c3d4',
      type: 'note',
      body: 'Run the parser tests',
    });
  });

  it('replies to a message, threading replyTo and the sender', () => {
    useMailboxStore.setState({
      messages: [
        {
          id: 'mail-0001',
          from: 'worker-a1b2c3d4',
          to: 'leader',
          type: 'result',
          subject: 'Parser report',
          body: 'All green.',
          priority: 'normal',
          readBy: {},
          readByCount: 1,
          completed: false,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    render(<MailboxPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByDisplayValue('worker-a1b2c3d4')).toBeTruthy();
    expect(screen.getByDisplayValue('Re: Parser report')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'Acknowledged' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const sent = sends.find((message) => message.type === 'mailbox.send');
    expect(sent?.payload).toMatchObject({
      to: 'worker-a1b2c3d4',
      type: 'note',
      subject: 'Re: Parser report',
      body: 'Acknowledged',
      replyTo: 'mail-0001',
    });
  });

  it('sends from the compose dialog with Ctrl+Enter', () => {
    render(<MailboxPanel />);
    fireEvent.click(screen.getByRole('button', { name: /compose message/i }));
    fireEvent.change(screen.getByPlaceholderText('Message body'), {
      target: { value: 'Keyboard send' },
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });

    expect(sends.some((message) => message.type === 'mailbox.send')).toBe(true);
  });
});
