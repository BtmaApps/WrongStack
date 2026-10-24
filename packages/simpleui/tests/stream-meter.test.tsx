// @vitest-environment jsdom

import { reduceStreamActivity, type StreamActivity } from '@wrongstack/webui-protocol';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamMeter } from '../src/stream-meter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const host = document.createElement('div');
const screen = {
  getByText: (text: string) =>
    Array.from(host.querySelectorAll('*')).find((node) => node.textContent === text),
  getByLabelText: (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!,
};
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.useRealTimers();
});

describe('SimpleUI model activity', () => {
  it('samples raw deltas, stops the waveform on a stall and cleans up its timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const activityRef: { current: StreamActivity | null } = { current: null };
    root = createRoot(host);
    act(() => root!.render(<StreamMeter activityRef={activityRef} running />));
    expect(screen.getByText('Waiting for model')).toBeTruthy();
    activityRef.current = reduceStreamActivity(null, {
      type: 'provider.text_delta',
      payload: { text: 'x'.repeat(160) },
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('≈40 tokens')).toBeTruthy();
    expect(screen.getByText('≈40 tok/s')).toBeTruthy();
    expect(screen.getByLabelText('Model output activity').dataset.receiving).toBe('true');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('≈0 tok/s')).toBeTruthy();
    expect(screen.getByLabelText('Model output activity').dataset.receiving).toBe('false');
    activityRef.current = reduceStreamActivity(activityRef.current, { type: 'run.result' });
    act(() => root!.render(<StreamMeter activityRef={activityRef} running={false} />));
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
