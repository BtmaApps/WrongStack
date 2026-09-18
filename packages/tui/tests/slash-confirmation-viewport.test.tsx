import { describe, expect, it, vi } from 'vitest';
import { CheckpointTimeline } from '../src/components/checkpoint-timeline.js';
import {
  ClearConfirmPanel,
  clearConfirmationKeyResult,
} from '../src/components/clear-confirm-panel.js';
import {
  ExitConfirmPanel,
  exitConfirmationDecision,
} from '../src/components/exit-confirm-panel.js';
import { MonitorViewportProvider } from '../src/components/monitor-shell.js';
import {
  SlashConfirmPanel,
  slashConfirmationDecision,
} from '../src/components/slash-confirm-panel.js';
import { renderRealTty, settle } from './helpers/real-tty.js';

it('modified keys never approve slash confirmations', () => {
  expect(slashConfirmationDecision('y', { ctrl: true } as never, true)).toBeNull();
  expect(slashConfirmationDecision('', { meta: true, return: true } as never, true)).toBeNull();
  expect(exitConfirmationDecision('', { ctrl: true, return: true } as never)).toBeNull();
  expect(clearConfirmationKeyResult('YES', '', { meta: true, return: true }).decision).toBeNull();
});

it('does not launch a second rewind while the first one is pending', async () => {
  let finish!: () => void;
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderRealTty(
    <CheckpointTimeline
      checkpoints={[
        { promptIndex: 0, promptPreview: 'test', ts: '2026-09-18T00:00:00Z', fileCount: 1 },
      ]}
      selected={0}
      onSelect={() => {}}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
    { columns: 80, rows: 24 },
  );
  try {
    await settle();
    view.stdin.write('\r');
    await settle();
    view.stdin.write('\r');
    await settle();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  } finally {
    finish?.();
    view.unmount();
  }
});

describe.each([
  [80, 16],
  [40, 8],
])('slash confirmations %ix%i', (columns, rows) => {
  const cases = [
    ['clear', <ClearConfirmPanel leaderActive subagentCount={25} value="YE" />],
    ['exit', <ExitConfirmPanel leaderActive subagentCount={25} backgroundCount={4} />],
    [
      'generic',
      <SlashConfirmPanel
        question={'Apply this change to the workspace? '.repeat(20)}
        defaultYes={false}
      />,
    ],
  ] as const;
  it.each(cases)('%s keeps the decision controls visible', async (_name, element) => {
    const view = renderRealTty(
      <MonitorViewportProvider value={{ columns, rows }}>{element}</MonitorViewportProvider>,
      { columns, rows: 100 },
    );
    try {
      await settle();
      expect(view.lastFrame()).toContain('Esc');
      expect(view.lastFrame()).toContain('Enter');
      expect(view.lastFrame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
    } finally {
      view.unmount();
    }
  });
  it('rewind keeps a deep selection visible', async () => {
    const onConfirm = vi.fn();
    const view = renderRealTty(
      <MonitorViewportProvider value={{ columns, rows }}>
        <CheckpointTimeline
          checkpoints={Array.from({ length: 40 }, (_, i) => ({
            promptIndex: i,
            promptPreview: `checkpoint-${i}`,
            ts: '2026-09-18T00:00:00Z',
            fileCount: 2,
          }))}
          selected={32}
          onSelect={() => {}}
          onConfirm={onConfirm}
          onClose={() => {}}
        />
      </MonitorViewportProvider>,
      { columns, rows: 100 },
    );
    try {
      await settle();
      expect(view.lastFrame()).toContain('checkpoint-32');
      expect(view.lastFrame()).toContain('Esc');
      expect(view.lastFrame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
    } finally {
      view.unmount();
    }
  });
});
