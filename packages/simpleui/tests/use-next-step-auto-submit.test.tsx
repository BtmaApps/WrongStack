// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type NextStepAutoCountdown,
  useNextStepAutoSubmit,
} from '../src/hooks/use-next-step-auto-submit.js';
import type { ChatMessage } from '../src/types.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLY = [
  'Done.',
  '<nextsteps>',
  '1. Run the focused tests',
  '2. Review the diff',
  '</nextsteps>',
].join('\n');

function reply(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    text: REPLY,
    final: true,
    autoEligible: true,
    ...overrides,
  };
}

interface Props {
  messages: ChatMessage[];
  autonomy: string;
  yolo: boolean;
  running: boolean;
  hasDraft: boolean;
  queuedCount: number;
  blocked: boolean;
  connected: boolean;
  maxIterations: number;
  consumed: Set<string>;
}

const BASE: Props = {
  messages: [reply()],
  autonomy: 'auto',
  yolo: true,
  running: false,
  hasDraft: false,
  queuedCount: 0,
  blocked: false,
  connected: true,
  maxIterations: 0,
  consumed: new Set(),
};

const roots: Array<ReturnType<typeof createRoot>> = [];

function mount(initial: Partial<Props> = {}) {
  const submit = vi.fn().mockReturnValue(true);
  const markConsumed = vi.fn();
  const onPaused = vi.fn();
  const seen: { countdown: NextStepAutoCountdown | null; cancel: () => void } = {
    countdown: null,
    cancel: () => undefined,
  };
  function Harness(props: Props) {
    const result = useNextStepAutoSubmit({
      sessionId: 's1',
      delayMs: 5_000,
      submit,
      markConsumed,
      onPaused,
      ...props,
    });
    seen.countdown = result.countdown;
    seen.cancel = result.cancel;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  const render = (next: Partial<Props>) =>
    act(() => {
      root.render(<Harness {...{ ...BASE, ...initial, ...next }} />);
    });
  render({});
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  return { render, advance, submit, markConsumed, onPaused, seen };
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.useRealTimers();
});

describe('useNextStepAutoSubmit', () => {
  it('counts down, then submits the first step when nothing is marked auto', async () => {
    vi.useFakeTimers();
    const h = mount();
    expect(h.seen.countdown).toMatchObject({ messageId: 'a1', stepIndex: 1, remaining: 5 });
    await h.advance(4_900);
    expect(h.submit).not.toHaveBeenCalled();
    await h.advance(200);
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(h.submit).toHaveBeenCalledWith('Run the focused tests');
    expect(h.markConsumed).toHaveBeenCalledWith('a1');
  });

  it('submits the model-marked step instead of the first', async () => {
    vi.useFakeTimers();
    const marked = reply({
      nextSteps: [
        { index: 1, text: 'Run the focused tests' },
        { index: 2, text: 'Review the diff', auto: true },
      ],
    });
    const h = mount({ messages: [marked] });
    expect(h.seen.countdown?.stepIndex).toBe(2);
    await h.advance(5_100);
    expect(h.submit).toHaveBeenCalledWith('Review the diff');
  });

  it.each([
    ['autonomy is not auto', { autonomy: 'suggest' }],
    ['YOLO is off', { yolo: false }],
    ['the run is still going', { running: true }],
    ['a draft is being typed', { hasDraft: true }],
    ['messages are queued', { queuedCount: 1 }],
    ['a confirmation is open', { blocked: true }],
    ['the socket is not open', { connected: false }],
    ['the reply is not live-eligible', { messages: [reply({ autoEligible: undefined })] }],
    ['the reply is not final', { messages: [reply({ final: false })] }],
    ['the steps were already used', { consumed: new Set(['a1']) }],
  ] as Array<[string, Partial<Props>]>)('never submits when %s', async (_name, patch) => {
    vi.useFakeTimers();
    const h = mount(patch);
    expect(h.seen.countdown).toBeNull();
    await h.advance(10_000);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('cancels from the countdown and stays cancelled for that reply', async () => {
    vi.useFakeTimers();
    const h = mount();
    act(() => h.seen.cancel());
    expect(h.seen.countdown).toBeNull();
    await h.advance(10_000);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('cancels when the user starts typing mid-countdown', async () => {
    vi.useFakeTimers();
    const h = mount();
    h.render({ hasDraft: true });
    h.render({ hasDraft: false });
    expect(h.seen.countdown).toBeNull();
    await h.advance(10_000);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('cancels when autonomy is switched off mid-countdown', async () => {
    vi.useFakeTimers();
    const h = mount();
    h.render({ autonomy: 'off' });
    await h.advance(10_000);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('pauses with a notice instead of counting down once the iteration cap is reached', async () => {
    vi.useFakeTimers();
    const h = mount({ maxIterations: 1 });
    await h.advance(5_100);
    expect(h.submit).toHaveBeenCalledTimes(1);

    // The next turn arrives with the same suggestions; the cap is now spent.
    h.render({ maxIterations: 1, messages: [reply({ id: 'a2', text: REPLY })] });
    expect(h.seen.countdown).toBeNull();
    expect(h.onPaused).toHaveBeenCalledWith('cap');
    await h.advance(10_000);
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the message and stops when nothing could be sent', async () => {
    vi.useFakeTimers();
    const h = mount();
    h.submit.mockReturnValue(false);
    await h.advance(5_100);
    expect(h.submit).toHaveBeenCalledTimes(1);
    expect(h.markConsumed).not.toHaveBeenCalled();
    expect(h.seen.countdown).toBeNull();
  });
});
