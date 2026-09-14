import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolLedgerCard } from '../../src/components/MessageBubble/ToolLedgerCard.js';
import type { ChatMessage } from '../../src/stores/types.js';

const message: ChatMessage = {
  id: 'tool-1',
  role: 'tool',
  content: '',
  timestamp: 1,
  toolName: 'bash',
  toolInput: { command: 'pnpm test', cwd: 'packages/webui' },
  toolResult: 'Tests passed',
  toolDurationMs: 1200,
  toolOutputBytes: 2048,
  toolOutputTokens: 585,
  toolOutputLines: 19,
};

describe('<ToolLedgerCard />', () => {
  it('shows explicit success metadata and keeps the generic input/output behind Details', () => {
    render(<ToolLedgerCard message={message} />);
    expect(screen.getByText('Succeeded')).toBeTruthy();
    expect(screen.getByText('1.20s')).toBeTruthy();
    expect(screen.getByText('2.0 KiB')).toBeTruthy();
    expect(screen.getByText('~585 tok')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /bash/i }));
    expect(screen.getByText('Command run')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getAllByText('pnpm test')).toHaveLength(2);
    expect(screen.getByText('Tests passed')).toBeTruthy();
  });

  it('names error and live states instead of relying on the status color alone', () => {
    const { rerender } = render(<ToolLedgerCard message={{ ...message, isError: true }} />);
    expect(screen.getByText('Failed')).toBeTruthy();

    rerender(<ToolLedgerCard message={{ ...message, toolResult: undefined }} />);
    expect(screen.getByText('Running')).toBeTruthy();
  });
});
