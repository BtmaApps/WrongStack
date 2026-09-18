import { describe, expect, it, vi } from 'vitest';
import { ConfirmPrompt } from '../src/components/confirm-prompt.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

describe.each([100, 40])('approval pointer controls at %i columns', (columns) => {
  it('only activates the actual clicked button, including wrapped rows', async () => {
    const decide = vi.fn();
    const view = renderRealTty(
      <ConfirmPrompt
        toolName="exec"
        input={{ command: 'echo test' }}
        suggestedPattern="exec"
        onDecision={decide}
        onEnableYolo={vi.fn()}
      />,
      { columns, rows: 24 },
    );
    try {
      await settle();
      view.stdin.write('\x1b[<0;3;2M');
      await settle();
      expect(decide).not.toHaveBeenCalled();
      const lines = view.lines();
      const row = lines.findIndex((line) => line.includes('[d]'));
      expect(row).toBeGreaterThan(0);
      const column = lines[row]!.indexOf('[d]') + 1;
      view.stdin.write(`\x1b[<0;${column};${row + 1}M`);
      await settle();
      expect(decide).toHaveBeenCalledOnce();
      expect(decide).toHaveBeenCalledWith('deny');
    } finally {
      view.unmount();
    }
  });
});

it('keeps approval controls visible above a long preview in a short terminal', async () => {
  const view = renderRealTty(
    <ConfirmPrompt
      toolName="write"
      input={{
        path: 'test.txt',
        content: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
      }}
      suggestedPattern="write"
      onDecision={vi.fn()}
      onEnableYolo={vi.fn()}
      {...{ maxRows: 12 }}
    />,
    { columns: 52, rows: 16 },
  );
  try {
    await settle(100);
    expect(view.lastFrame()).toContain('[y]');
    expect(view.lastFrame()).toContain('[n]');
    expect(view.lines().length).toBeLessThanOrEqual(12);
  } finally {
    view.unmount();
  }
});
