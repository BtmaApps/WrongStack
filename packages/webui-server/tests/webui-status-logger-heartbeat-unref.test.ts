import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWebUILiveStatusLogger } from '../src/server/webui-status-logger.js';

// Real timers on purpose: `hasRef()` must report the state of the REAL
// event-loop reference; vitest's fake-timer objects do not.
describe('webui status logger heartbeat interval', () => {
  const realSetInterval = globalThis.setInterval;
  let created: NodeJS.Timeout[] = [];

  beforeEach(() => {
    created = [];
    globalThis.setInterval = ((handler: (...args: never[]) => void, ms?: number) => {
      const timer = realSetInterval(handler, ms) as unknown as NodeJS.Timeout;
      created.push(timer);
      return timer as unknown as number;
    }) as typeof setInterval;
  });

  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    vi.clearAllMocks();
  });

  it("does not keep the process alive: the logger's heartbeat interval is unref'd", () => {
    const events = { on: vi.fn(), off: vi.fn() };
    const setSessions = vi.fn();
    // Long heartbeat so no tick fires while the test runs; the contract under
    // test is the event-loop reference, not the cadence.
    const stop = startWebUILiveStatusLogger({
      events,
      getSessionList: () => [{ id: 'sess_1', model: 'm1', provider: 'p1', isRunning: true }],
      dashboard: { enabled: true, setSessions },
      heartbeatMs: 60_000,
    });

    expect(created.length).toBeGreaterThan(0);
    // The heartbeat is housekeeping for the host-terminal panel: the CLI's
    // own listeners keep the loop alive while it serves, so the interval
    // must not hold it hostage past shutdown (same .unref convention as the
    // other intervals in this package).
    for (const timer of created) expect(timer.hasRef()).toBe(false);

    // Lifecycle stays clean: the disposer tears the interval down as before.
    stop();
  });
});
