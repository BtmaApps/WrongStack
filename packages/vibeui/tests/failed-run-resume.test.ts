// @vitest-environment jsdom
import type { ProtocolEnvelope } from '@wrongstack/webui-protocol';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFailedRunResume } from '../src/lib/failed-run-resume';
import { initialState, type SessionState } from '../src/lib/session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timedOut = {
  sessionId: 's1',
  requestId: 'r1',
  status: 'failed',
  error: { code: 'PROVIDER_NETWORK_ERROR', message: 'stream timeout', recoverable: true },
};

const roots: Root[] = [];

function setup(prefs: Record<string, unknown> = { autonomy: 'auto' }) {
  const listeners = new Set<(frame: ProtocolEnvelope) => void>();
  const subscribe = (listener: (frame: ProtocolEnvelope) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const base = initialState();
  const current = {
    current: {
      ...base,
      id: 's1',
      prefs,
      messages: [{ id: 'u1', role: 'user', text: 'build it' }],
    } as SessionState,
  };
  const ownedRuns = { current: new Map([['s1', 'r1']]) };
  const stopping = { current: '' };
  const queueRef = { current: [] as Array<{ sessionId: string }> };
  const notice = vi.fn();
  const dispatch = vi.fn((_content: string, _images: []) => true);
  function Probe() {
    useFailedRunResume({ subscribe, current, ownedRuns, stopping, queueRef, notice, dispatch });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  act(() => root.render(createElement(Probe)));
  const emit = (payload: unknown) =>
    act(() => {
      for (const listener of listeners) {
        listener({ type: 'run.result', payload } as unknown as ProtocolEnvelope);
      }
    });
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  return { current, stopping, notice, dispatch, emit, wait };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.useRealTimers();
});

describe('useFailedRunResume', () => {
  it('resumes a run a provider killed, backing off per attempt, then pauses', () => {
    const { emit, wait, dispatch, notice } = setup();
    emit(timedOut);
    wait(14_000);
    expect(dispatch).not.toHaveBeenCalled();
    wait(1_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toContain('Automatic resume 1 of 3');
    expect(dispatch.mock.calls[0]?.[0]).toContain('stream timeout');

    emit(timedOut);
    wait(29_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    wait(1_000);
    expect(dispatch).toHaveBeenCalledTimes(2);

    emit(timedOut);
    wait(60_000);
    expect(dispatch).toHaveBeenCalledTimes(3);

    emit(timedOut);
    wait(120_000);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(notice.mock.calls.at(-1)?.[0]).toContain('switch the model');
  });

  it('gives the next outage the full budget once a run completes', () => {
    const { emit, wait, dispatch } = setup();
    for (let i = 0; i < 3; i++) {
      emit(timedOut);
      wait(60_000);
    }
    emit({ sessionId: 's1', status: 'done' });
    emit(timedOut);
    wait(15_000);
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(dispatch.mock.calls[3]?.[0]).toContain('Automatic resume 1 of 3');
  });

  it('waits at least 15s even with a shorter auto delay', () => {
    const { emit, wait, dispatch } = setup({ autonomy: 'auto', autonomyDelayMs: 1_000 });
    emit(timedOut);
    wait(14_000);
    expect(dispatch).not.toHaveBeenCalled();
    wait(1_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('lets the user take over: a new message or Stop all cancels the resume', () => {
    const typed = setup();
    typed.emit(timedOut);
    typed.current.current = {
      ...typed.current.current,
      messages: [
        ...typed.current.current.messages,
        { id: 'u2', role: 'user', text: 'try another way' },
      ],
    };
    typed.wait(60_000);
    expect(typed.dispatch).not.toHaveBeenCalled();

    const stopped = setup();
    stopped.emit(timedOut);
    stopped.stopping.current = 's1';
    stopped.wait(60_000);
    expect(stopped.dispatch).not.toHaveBeenCalled();
  });

  it('ignores runs it must not touch', () => {
    const off = setup({ autonomy: 'off' });
    off.emit(timedOut);
    off.wait(60_000);
    expect(off.dispatch).not.toHaveBeenCalled();

    const { emit, wait, dispatch } = setup();
    // Another tab's run, another session, and failures a resume would not fix.
    emit({ ...timedOut, requestId: 'r2' });
    emit({ ...timedOut, sessionId: 's2' });
    emit({ ...timedOut, error: { ...timedOut.error, code: 'PROVIDER_CONTEXT_OVERFLOW' } });
    emit({ ...timedOut, error: { ...timedOut.error, recoverable: false } });
    emit({ ...timedOut, status: 'aborted' });
    wait(60_000);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
