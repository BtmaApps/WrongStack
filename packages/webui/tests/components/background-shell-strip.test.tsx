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
const confirm = vi.fn(async () => true);

vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ client }) }));
vi.mock('../../src/components/ConfirmModal', () => ({ confirmModal: () => confirm() }));
vi.mock('@/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores')>()),
  useActiveSessionId: () => 's1',
}));

const { useConfigStore } = await import('@/stores');
const { BackgroundShellStrip } = await import(
  '../../src/components/ChatView/BackgroundShellStrip.js'
);

function emit(type: string, payload: unknown) {
  act(() => {
    for (const handler of handlers.get(type) ?? []) handler({ type, payload });
  });
}

const sent = (type: string) => sends.filter((m) => m.type === type);

const devServer = {
  pid: 4242,
  command: 'pnpm   dev',
  tool: 'bash',
  startedAt: Date.now() - 125_000,
  status: 'running',
  background: true,
  hasOutput: true,
  sessionId: 's1',
};

beforeEach(() => {
  handlers.clear();
  sends.length = 0;
  confirm.mockClear();
  useConfigStore.setState({ wsConnected: true });
});

describe('BackgroundShellStrip', () => {
  it('asks for the list, and shows nothing while no background shell runs', () => {
    const { container } = render(<BackgroundShellStrip />);
    expect(sent('process.list')).toEqual([{ type: 'process.list', payload: { sessionId: 's1' } }]);
    emit('process.list', {
      sessionId: 's1',
      processes: [
        { ...devServer, pid: 1, background: false },
        { ...devServer, pid: 2, status: 'killed' },
      ],
    });
    expect(container.innerHTML).toBe('');
  });

  it('shows a chip per running background shell of this tab, with its age', () => {
    render(<BackgroundShellStrip />);
    emit('process.list', { sessionId: 's1', processes: [devServer] });
    expect(screen.getByRole('button', { name: /pnpm dev/ }).textContent).toContain('2m');
    // Another tab's reply does not replace this tab's list.
    emit('process.list', { sessionId: 's2', processes: [] });
    expect(screen.getByRole('button', { name: /pnpm dev/ })).toBeTruthy();
  });

  it('asks again after a shell tool call, and only then', () => {
    render(<BackgroundShellStrip />);
    emit('tool.executed', { sessionId: 's1', name: 'read' });
    expect(sent('process.list')).toHaveLength(1);
    emit('tool.executed', { sessionId: 's1', name: 'bash' });
    expect(sent('process.list')).toHaveLength(2);
  });

  it('opens the output of a shell, and stops it after confirmation', async () => {
    render(<BackgroundShellStrip />);
    emit('process.list', { sessionId: 's1', processes: [devServer] });
    fireEvent.click(screen.getByRole('button', { name: /pnpm dev/ }));
    expect(sent('process.output')).toEqual([
      { type: 'process.output', payload: { pid: 4242, lines: 12, sessionId: 's1' } },
    ]);
    emit('process.output', { sessionId: 's1', pid: 4242, lines: ['compiled', 'ready on :5173'] });
    expect(screen.getByText(/ready on :5173/).textContent).toBe('compiled\nready on :5173');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(sent('process.kill')).toEqual([
      { type: 'process.kill', payload: { pid: 4242, sessionId: 's1' } },
    ]);
  });

  it('says when a shell keeps no output', () => {
    render(<BackgroundShellStrip />);
    emit('process.list', { sessionId: 's1', processes: [{ ...devServer, hasOutput: false }] });
    fireEvent.click(screen.getByRole('button', { name: /pnpm dev/ }));
    expect(screen.getByText("This process's output is not captured")).toBeTruthy();
  });
});
