import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamMeter } from '../../src/components/StreamMeter';
import { observeStreamActivity, readStreamActivity } from '../../src/lib/stream-activity';
import { chatLane, disposeLane, ensureLane, setActiveLane } from '../../src/stores/chat-lanes';
import type { WSServerMessage } from '../../src/types';

const frame = (type: string, sessionId: string, rest = {}): WSServerMessage =>
  ({ type, payload: { sessionId, ...rest } }) as WSServerMessage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  for (const id of ['meter-a', 'meter-b']) {
    disposeLane(id);
    ensureLane(id);
  }
  setActiveLane('meter-a');
});
afterEach(() => {
  cleanup();
  disposeLane('meter-a');
  disposeLane('meter-b');
  vi.useRealTimers();
});

describe('model stream meter', () => {
  it('keeps background output separate and cleans up disposed lanes', () => {
    observeStreamActivity(
      frame('provider.text_delta', 'meter-b', { text: 'a'.repeat(80), messageId: 'b' }),
    );
    expect(readStreamActivity('meter-a')).toBeNull();
    expect(readStreamActivity('meter-b')?.receivedChars).toBe(80);
    disposeLane('meter-b');
    expect(readStreamActivity('meter-b')).toBeNull();
  });

  it('shows live speed, settles to real usage and releases its clock', () => {
    chatLane('meter-a').setLoading(true);
    render(<StreamMeter />);
    expect(screen.getByText('Waiting for model')).toBeTruthy();
    observeStreamActivity(frame('provider.thinking_delta', 'meter-a', { text: 'a'.repeat(80) }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('≈20 tokens')).toBeTruthy();
    expect(screen.getByText('≈20 tok/s')).toBeTruthy();
    expect(screen.getByText('Thinking')).toBeTruthy();
    observeStreamActivity(frame('provider.response', 'meter-a', { usage: { output: 17 } }));
    observeStreamActivity(frame('run.result', 'meter-a'));
    act(() => {
      chatLane('meter-a').setLoading(false);
    });
    expect(screen.getByText('17 tokens')).toBeTruthy();
    expect(screen.getByText('Finished')).toBeTruthy();
    const before = screen.getByLabelText('Model output activity').textContent;
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByLabelText('Model output activity').textContent).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows zero speed after a stall and restores the selected session meter', () => {
    chatLane('meter-a').setLoading(true);
    observeStreamActivity(frame('provider.text_delta', 'meter-a', { text: 'a'.repeat(40) }));
    render(<StreamMeter />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('≈0 tok/s')).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    observeStreamActivity(frame('provider.text_delta', 'meter-b', { text: 'b'.repeat(120) }));
    act(() => {
      setActiveLane('meter-b');
    });
    expect(screen.getByText('≈30 tokens')).toBeTruthy();
    act(() => {
      setActiveLane('meter-a');
    });
    expect(screen.getByText('≈10 tokens')).toBeTruthy();
  });
});
