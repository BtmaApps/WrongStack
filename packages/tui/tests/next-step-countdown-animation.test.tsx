import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stopNextStepsAutoSubmitOnKey } from '../src/app-key-handler.js';
import {
  Entry,
  findArmedNextStepsEntryId,
  NEXT_STEP_SWEEP_DURATION_MS,
  nextStepSweepGlyphCount,
  nextStepSweepParts,
} from '../src/components/history/entry.js';
import type { HistoryEntry } from '../src/components/history.js';
import type { KeyEvent } from '../src/components/input.js';
import type { MouseEventInfo } from '../src/mouse.js';

const KEY: KeyEvent = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  return: false,
  escape: false,
  ctrl: false,
  meta: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  pageUp: false,
  pageDown: false,
  home: false,
  end: false,
};

/** Every report shape the input layer emits (components/input.tsx parse path). */
const POINTER_REPORTS: MouseEventInfo[] = [
  {
    kind: 'press',
    button: 'left',
    x: 12,
    y: 4,
    wheel: 0,
    shift: false,
    meta: false,
    ctrl: false,
    motion: false,
  },
  {
    kind: 'release',
    button: 'left',
    x: 12,
    y: 4,
    wheel: 0,
    shift: false,
    meta: false,
    ctrl: false,
    motion: false,
  },
  {
    kind: 'press',
    button: 'right',
    x: 3,
    y: 9,
    wheel: 0,
    shift: false,
    meta: false,
    ctrl: false,
    motion: false,
  },
  {
    kind: 'move',
    button: 'left',
    x: 40,
    y: 7,
    wheel: 0,
    shift: false,
    meta: false,
    ctrl: false,
    motion: true,
  },
  {
    kind: 'wheel',
    button: 'none',
    x: 20,
    y: 6,
    wheel: 1,
    shift: false,
    meta: false,
    ctrl: false,
    motion: false,
  },
  {
    kind: 'wheel',
    button: 'none',
    x: 20,
    y: 6,
    wheel: -1,
    shift: false,
    meta: false,
    ctrl: false,
    motion: false,
  },
];

const ENTRY: HistoryEntry = {
  id: 42,
  kind: 'assistant',
  final: true,
  text: [
    'Done.',
    '',
    '<nextsteps>',
    '1. Add unit tests for the parser',
    '2. Run the full suite',
    '</nextsteps>',
  ].join('\n'),
};

afterEach(() => {
  vi.useRealTimers();
});

describe('next-step auto-submit text sweep', () => {
  it('maps the final 10,000ms proportionally across the whole label', () => {
    const deadline = 50_000;

    expect(nextStepSweepGlyphCount(20, deadline, deadline - 10_001)).toBe(0);
    expect(nextStepSweepGlyphCount(20, deadline, deadline - NEXT_STEP_SWEEP_DURATION_MS)).toBe(0);
    expect(nextStepSweepGlyphCount(20, deadline, deadline - 7_500)).toBe(5);
    expect(nextStepSweepGlyphCount(20, deadline, deadline - 5_000)).toBe(10);
    expect(nextStepSweepGlyphCount(20, deadline, deadline)).toBe(20);
  });

  it('animates the armed row even when the auto suggestion is not first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const deadline = Date.now() + 5_000;
    const view = render(
      <Entry
        entry={ENTRY}
        termWidth={100}
        autonomyMode="auto"
        nextStepsAutoSubmitLabel="Run the full suite"
        nextStepsAutoSubmitDeadlineMs={deadline}
      />,
    );

    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Add unit tests for the parser');
    expect(frame).toContain('Run the full suite');
    expect(nextStepSweepParts('Run the full suite', deadline, Date.now())).toEqual({
      lit: 'Run the f',
      cursor: 'u',
      pending: 'll suite',
    });

    view.unmount();
  });

  it('targets only the newest panel when an older turn repeats the same label', () => {
    expect(
      findArmedNextStepsEntryId(
        [
          { ...ENTRY, id: 7 },
          { ...ENTRY, id: 42 },
        ],
        'Run the full suite',
      ),
    ).toBe(42);
  });

  it('cancels the armed sweep and submit on the first user keystroke', () => {
    const cancel = vi.fn();

    stopNextStepsAutoSubmitOnKey(cancel, { input: '', key: { ...KEY, return: true }, draft: '' });

    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(POINTER_REPORTS.map((report) => [`${report.kind}/${report.button}`, report] as const))(
    'leaves the armed sweep running through a %s pointer report',
    (_name, report) => {
      const cancel = vi.fn();

      stopNextStepsAutoSubmitOnKey(cancel, {
        input: '',
        key: { ...KEY, mouse: report, wheelDeltaY: report.wheel },
        draft: '',
      });

      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['PageUp', { pageUp: true }, ''],
    ['PageDown', { pageDown: true }, ''],
    ['left arrow', { leftArrow: true }, ''],
    ['right arrow', { rightArrow: true }, ''],
    ['Home', { home: true }, ''],
    ['End', { end: true }, ''],
    ['Ctrl+U paging', { ctrl: true }, 'u'],
    ['Ctrl+D paging', { ctrl: true }, 'd'],
  ] as const)(
    'leaves the armed sweep running through %s over an empty composer',
    (_name, overrides, input) => {
      const cancel = vi.fn();

      stopNextStepsAutoSubmitOnKey(cancel, { input, key: { ...KEY, ...overrides }, draft: '' });

      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a pointer report', { ...KEY, mouse: POINTER_REPORTS[0]! }],
    ['PageUp', { ...KEY, pageUp: true }],
    ['a left-arrow caret move', { ...KEY, leftArrow: true }],
  ] as const)('cancels on %s once the composer holds text', (_name, key) => {
    const cancel = vi.fn();

    stopNextStepsAutoSubmitOnKey(cancel, { input: '', key, draft: 'half typed' });

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels on a typing key that carries no pointer report', () => {
    const cancel = vi.fn();

    stopNextStepsAutoSubmitOnKey(cancel, { input: '', key: { ...KEY, escape: true }, draft: '' });

    expect(cancel).toHaveBeenCalledOnce();
  });
});
