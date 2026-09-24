import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Message = { type: string; payload?: unknown };
type Handler = (message: Message) => void;

const handlers = new Map<string, Set<Handler>>();
const sends: Message[] = [];
const client = {
  isConnected: true,
  on(type: string, handler: Handler) {
    const registered = handlers.get(type) ?? new Set();
    registered.add(handler);
    handlers.set(type, registered);
    return () => registered.delete(handler);
  },
  send(message: Message) {
    sends.push(message);
  },
  withSession: (payload: Record<string, unknown>) => ({ ...payload, sessionId: 's1' }),
};

vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ client }) }));
vi.mock('@/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores')>()),
  useActiveSessionId: () => 's1',
}));

const { useConfigStore } = await import('@/stores');
const { BrowserLivePane } = await import('../../src/components/BrowserLivePane.js');

function emit(type: string, payload: unknown) {
  act(() => {
    for (const handler of handlers.get(type) ?? []) handler({ type, payload });
  });
}
const sent = (type: string) => sends.filter((m) => m.type === type);

const shop = { id: 'b1', url: 'https://shop.test/', title: 'Shop' };
const docs = { id: 'b2', url: 'https://docs.test/', title: 'Docs' };

beforeEach(() => {
  handlers.clear();
  sends.length = 0;
  useConfigStore.setState({ wsConnected: true });
});

describe('BrowserLivePane', () => {
  it('lists the tab’s browsers, and says so when there is none', () => {
    render(<BrowserLivePane />);
    expect(sent('browser.live.list')).toEqual([
      { type: 'browser.live.list', payload: { sessionId: 's1' } },
    ]);
    emit('browser.live.list', { sessionId: 's1', sessions: [] });
    expect(screen.getByText('The agent has no browser open.')).toBeTruthy();
  });

  it('asks again after a browser tool call, and only then', () => {
    render(<BrowserLivePane />);
    emit('tool.executed', { sessionId: 's1', name: 'bash' });
    emit('tool.executed', { sessionId: 's1', name: 'browser_open' });
    // The browser tools are off the direct list, so the model reaches them via tool_use.
    emit('tool.executed', { sessionId: 's1', name: 'tool_use' });
    expect(sent('browser.live.list')).toHaveLength(3);
  });

  it('watches the page, shows its frames and details, and stops on unmount', () => {
    const view = render(<BrowserLivePane />);
    emit('browser.live.list', { sessionId: 's1', sessions: [shop] });
    expect(sent('browser.live.watch')).toEqual([
      { type: 'browser.live.watch', payload: { id: 'b1', sessionId: 's1' } },
    ]);
    expect(screen.getByText('Waiting for the first frame…')).toBeTruthy();

    emit('browser.live.frame', {
      sessionId: 's1',
      id: 'b1',
      data: 'AAAA',
      width: 1280,
      height: 800,
    });
    // Another tab's frame for the same id is not shown.
    emit('browser.live.frame', { sessionId: 's2', id: 'b1', data: 'BBBB', width: 1, height: 1 });
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toBe('data:image/jpeg;base64,AAAA');

    emit('browser.live.details', {
      sessionId: 's1',
      id: 'b1',
      url: 'https://shop.test/cart',
      title: 'Cart',
      console: [{ level: 'error', text: 'boom', at: 't' }],
      network: [{ method: 'GET', url: 'https://shop.test/api', status: 500, at: 't' }],
    });
    expect(screen.getByText('https://shop.test/cart')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Network/ }));
    expect(screen.getByText('https://shop.test/api')).toBeTruthy();

    view.unmount();
    expect(sent('browser.live.unwatch')).toHaveLength(1);
  });

  it('switches between browsers, and says when one has closed', () => {
    render(<BrowserLivePane />);
    emit('browser.live.list', { sessionId: 's1', sessions: [shop, docs] });
    fireEvent.click(screen.getByRole('tab', { name: 'Docs' }));
    expect(sent('browser.live.unwatch')).toHaveLength(1);
    expect(sent('browser.live.watch').at(-1)).toEqual({
      type: 'browser.live.watch',
      payload: { id: 'b2', sessionId: 's1' },
    });
    emit('browser.live.details', { sessionId: 's1', id: 'b2', gone: true });
    expect(screen.getByText('The browser was closed.')).toBeTruthy();
  });
});
