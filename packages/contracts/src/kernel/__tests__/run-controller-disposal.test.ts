import { describe, expect, it } from 'vitest';
import { EventBus, ScopedEventBus } from '../events.js';
import { RunController } from '../run-controller.js';

describe('RunController post-disposal abort', () => {
  it('keeps a normally completed run un-aborted when a late caller invokes abort()', async () => {
    const run = new RunController();
    let cleanup = 0;
    let abortEvents = 0;
    run.onAbort(() => {
      cleanup++;
    });
    run.signal.addEventListener('abort', () => {
      abortEvents++;
    });

    await run.dispose();
    expect(cleanup).toBe(1);
    expect(run.aborted).toBe(false);

    run.abort('late caller');
    expect(run.aborted).toBe(false);
    expect(abortEvents).toBe(0);
    expect(cleanup).toBe(1);
  });

  it('still permits abort before normal disposal and preserves its reason', async () => {
    const run = new RunController();
    run.abort('active run');
    expect(run.aborted).toBe(true);
    expect(run.signal.reason).toBe('active run');
    await run.dispose();
    expect(run.aborted).toBe(true);
  });

  it('detaches the parent signal during normal disposal', async () => {
    const parent = new AbortController();
    const run = new RunController({ parentSignal: parent.signal });
    await run.dispose();
    parent.abort('after completion');
    expect(run.aborted).toBe(false);
  });

  it('ScopedEventBus.off and clear remove tracked registrations, and EventBus.off removes once() listeners (F856)', () => {
    const scope = new ScopedEventBus();
    const fn = () => {};
    scope.on('run.started' as never, fn);
    expect(scope.scopedListenerCount).toBe(1);
    scope.off('run.started' as never, fn);
    expect(scope.scopedListenerCount).toBe(0);

    scope.on('run.started' as never, () => {});
    scope.clear();
    expect(scope.scopedListenerCount).toBe(0);

    const bus = new EventBus();
    let fired = false;
    const onceFn = () => {
      fired = true;
    };
    bus.once('run.started' as never, onceFn);
    bus.off('run.started' as never, onceFn);
    bus.emit('run.started' as never, {} as never);
    expect(fired).toBe(false);
  });
});
