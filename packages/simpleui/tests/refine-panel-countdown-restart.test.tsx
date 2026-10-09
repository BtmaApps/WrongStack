// @vitest-environment jsdom

/**
 * A second refine round can open while the SAME <RefinePanel> instance stays mounted:
 * startSend() replaces a 'ready'/'failed' state with a fresh 'countdown' state directly
 * (it only nulls the state first for countdown/refining). The panel must then run its
 * 3-2-1 grace period again instead of firing the refine request on the first render.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefineState } from '../src/lib/refine-model.js';
import { RefinePanel } from '../src/refine-panel.js';

const roots: Root[] = [];

const state = (status: RefineState['status']): RefineState => ({
  original: 'fix the bug',
  refined: 'Fix the null-pointer bug in the parser',
  english: 'Fix the NPE in the parser',
  status,
});

function mountPanel(preRefineSeconds = 3) {
  const onStartRefine = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const render = (status: RefineState['status']) =>
    act(() =>
      root.render(
        <RefinePanel
          state={state(status)}
          preRefineSeconds={preRefineSeconds}
          onDecision={vi.fn()}
          onRetry={vi.fn()}
          onRetryFallback={vi.fn()}
          onStartRefine={onStartRefine}
          onSendEdited={vi.fn()}
          onEditInComposer={vi.fn()}
        />,
      ),
    );
  return { onStartRefine, render };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('RefinePanel countdown restarted without an unmount', () => {
  it('waits the full grace period again when a ready panel becomes a new countdown', () => {
    const { onStartRefine, render } = mountPanel();
    render('countdown');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(1);

    render('refining');
    render('ready');
    render('countdown'); // new round, same mounted panel

    expect(onStartRefine).toHaveBeenCalledTimes(1); // not fired on the first render
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(2);
  });

  it('control: a freshly mounted countdown also fires only after the grace period', () => {
    const { onStartRefine, render } = mountPanel();
    render('countdown');
    expect(onStartRefine).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(1);
  });

  it('also waits again when a failed panel becomes a new countdown', () => {
    const { onStartRefine, render } = mountPanel();
    render('countdown');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    render('refining');
    render('failed');
    render('countdown');
    expect(onStartRefine).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(2);
  });

  it('fires exactly once per round', () => {
    const { onStartRefine, render } = mountPanel();
    render('countdown');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onStartRefine).toHaveBeenCalledTimes(1);
  });

  // The parent's one-shot guard (refineStartFiredRef) absorbs the duplicate call.
  it('a zero grace period starts the refine immediately', () => {
    const { onStartRefine, render } = mountPanel(0);
    render('countdown');
    expect(onStartRefine).toHaveBeenCalled();
  });
});
