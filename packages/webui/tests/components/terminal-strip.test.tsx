/**
 * The composer's terminal strip: while the terminal dock is hidden its
 * terminals keep running and show here, printing ones with a live dot, each
 * with a peek at its last lines and a way back to the dock.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useUIStore } = await import('@/stores');
const { noteTerminalOutput, useTerminalStripStore } = await import('@/stores/terminal-strip-store');
const { TerminalStrip } = await import('../../src/components/ChatView/TerminalStrip.js');

beforeEach(() => {
  useTerminalStripStore.getState().clear();
  useUIStore.setState({ terminalOpen: false });
});

describe('the output a terminal reports', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTerminalStripStore.getState().syncTabs([{ id: 't', name: 'T', status: 'running' }]);
  });
  afterEach(() => vi.useRealTimers());
  /** Output as the strip's store keeps it, after the frames are folded in. */
  const tailAfter = (...chunks: string[]) => {
    for (const chunk of chunks) noteTerminalOutput('t', chunk);
    vi.advanceTimersByTime(300);
    return useTerminalStripStore.getState().terminals[0]?.tail;
  };

  it('keeps plain text lines across frames, dropping escape sequences and redraws', () => {
    expect(
      tailAfter(
        '\x1b[32mPS C:\\> \x1b[0mnpm run bu',
        'ild\r\n> tsc\r\nprogress 10%\rprogress 90%\r\ndone\n',
      ),
    ).toEqual(['PS C:\\> npm run build', '> tsc', 'progress 90%', 'done', '']);
  });

  it('reads a cursor move to a new row as a line break (how ConPTY often starts a line)', () => {
    expect(
      tailAfter(
        '\x1b[?25l(c) Microsoft Corporation. All rights reserved.\x1b[3;1HD:\\proj>\x1b[4;1H\x1b[5;1Hping',
      ),
    ).toEqual(['(c) Microsoft Corporation. All rights reserved.', 'D:\\proj>', 'ping']);
  });

  it('keeps only the last lines for the peek', () => {
    const tail = tailAfter(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'));
    expect(tail).toHaveLength(12);
    expect(tail?.at(-1)).toBe('line 29');
  });
});

describe('TerminalStrip', () => {
  const seed = () =>
    act(() => {
      const store = useTerminalStripStore.getState();
      store.syncTabs([
        { id: 't1', name: 'Terminal 1', status: 'running' },
        { id: 't2', name: 'Terminal 2', status: 'exited', exitCode: 1 },
      ]);
      store.appendOutput('t1', ['$ pnpm dev', 'ready on :5173'], Date.now());
    });

  it('shows nothing while the dock is open, or with no terminals', () => {
    const { container, rerender } = render(<TerminalStrip />);
    expect(container.innerHTML).toBe('');
    seed();
    act(() => useUIStore.setState({ terminalOpen: true }));
    rerender(<TerminalStrip />);
    expect(screen.queryByTestId('terminal-strip')).toBeNull();
  });

  it('lists the hidden terminals, the printing one live, and peeks at its last lines', () => {
    seed();
    render(<TerminalStrip />);
    expect(screen.getByTestId('terminal-strip')).toBeTruthy();
    const first = screen.getByRole('button', { name: /Terminal 1/ });
    expect(first.querySelector('[data-state]')?.getAttribute('data-state')).toBe('printing');
    expect(screen.getByRole('button', { name: /Terminal 2/ }).textContent).toContain('1');

    fireEvent.click(first);
    expect(screen.getByText(/ready on :5173/)).toBeTruthy();
  });

  it('brings the dock back on the chosen terminal', () => {
    seed();
    render(<TerminalStrip />);
    fireEvent.click(screen.getByRole('button', { name: /Terminal 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open|stripOpen/ }));
    expect(useUIStore.getState().terminalOpen).toBe(true);
    expect(useTerminalStripStore.getState().focusRequest?.id).toBe('t1');
  });
});
