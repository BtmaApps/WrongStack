// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ToolCallEntry } from '../src/tool-call-entry.js';

describe('SimpleUI ToolFlow activity', () => {
  it.each(['tool_script', 'tool_use'])('shows the identity and measured output for %s', (name) => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const input = { script: 'return 1;' };
    const result = 'answer\n\n(2 tool calls: read ×2)\n\nToolFlow bytes: 20000 -> 40; calls: 2';
    try {
      act(() =>
        root.render(
          <ToolCallEntry
            toolCall={{
              id: 'flow',
              name,
              status: 'done',
              input: name === 'tool_script' ? input : { tool: 'tool_script', input },
              output:
                name === 'tool_script' ? result : JSON.stringify({ tool: 'tool_script', result }),
            }}
          />,
        ),
      );
      expect(container.textContent).toContain('WrongStack ToolFlow');
      expect(
        container.querySelector('[aria-label="ToolFlow measured output"]')?.textContent,
      ).toContain('2 calls · 20000 B tool results');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
