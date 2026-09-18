import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolGroup } from '../../src/components/ToolGroup.js';
import type { ChatMessage } from '../../src/stores/types.js';
import { loadDeferredI18nNamespaces } from '../helpers/i18n-deferred';

function tool(id: string, toolName: string, toolInput: unknown): ChatMessage {
  return {
    id,
    role: 'tool',
    content: '',
    timestamp: 1,
    toolName,
    toolInput,
    toolResult: 'ok',
  };
}

beforeAll(loadDeferredI18nNamespaces);

describe('<ToolGroup /> special tool views', () => {
  it('summarizes succeeded, failed, running, duration, and output size before expansion', () => {
    const { container } = render(
      <ToolGroup
        tools={[
          {
            ...tool('read-1', 'read', { path: 'a.ts' }),
            toolDurationMs: 125,
            toolOutputBytes: 1024,
          },
          {
            ...tool('grep-1', 'grep', { pattern: 'x' }),
            toolDurationMs: 375,
            toolOutputBytes: 1024,
            isError: true,
          },
          { ...tool('bash-1', 'bash', { command: 'pnpm test' }), toolResult: undefined },
        ]}
      />,
    );

    expect(screen.getByText('1 succeeded')).toBeTruthy();
    expect(screen.getByText('1 failed')).toBeTruthy();
    expect(screen.getByText('1 running')).toBeTruthy();
    expect(screen.getByText('500ms')).toBeTruthy();
    expect(screen.getByText('2.0 KiB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /3 tool calls/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Failed (1)' }));
    expect(container.querySelector('[data-message-id="grep-1"]')).toBeTruthy();
    expect(container.querySelector('[data-message-id="read-1"]')).toBeNull();
    expect(container.querySelector('[data-message-id="bash-1"]')).toBeNull();
  });

  it('keeps independent tool-specific views inside an expanded group', () => {
    const { container } = render(
      <ToolGroup
        defaultOpen
        tools={[
          tool('bash-1', 'bash', { command: 'pnpm test' }),
          tool('grep-1', 'grep', { pattern: 'ToolLedgerCard' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^bash/i }));
    fireEvent.click(screen.getByRole('button', { name: /^grep/i }));
    expect(container.querySelector('[data-tool-overview="command"]')).toBeTruthy();
    expect(container.querySelector('[data-tool-overview="filesystem"]')).toBeTruthy();
  });
});
