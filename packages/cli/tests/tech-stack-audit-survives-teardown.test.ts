import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: the tech-stack audit spawn opts into `gracefulFinish`.
 *
 * ⚠️ SCOPE — READ THIS BEFORE TRUSTING THIS FILE AS PROOF OF ANYTHING.
 *
 * These assertions prove ONE thing: the opt-in flag is passed to
 * `multiAgentHost.spawn` for the audit subagent. They do NOT prove the audit
 * survives leader teardown, and today it demonstrably does not.
 *
 * Live result on 2026-10-05, after this flag shipped and `dist` was rebuilt:
 *   routed_to_pkg-outdated-watcher=0  aborted_records=3  finish_requested_records=0
 *   VERDICT=STILL_ABORTED
 *
 * Why the flag is necessary but NOT sufficient — verified by reading the chain:
 *   1. `gracefulFinish` only widens the agent's own budget deadline. The
 *      watchdog path grants the grace window; `coordinator.requestFinish()`
 *      is notify-only and grants nothing
 *      (multi-agent-coordinator.ts:508-511 "Notify only — no grace grant").
 *   2. Teardown only WAITS for work that registered through the `session.ended`
 *      `waitUntil` hook (joined to a fixed point at execution-cleanup.ts:216-218)
 *      or through `chimeraWork.drainAndClose()`. The audit registers with
 *      neither, so `director.terminateAll()` reaps it regardless of the flag.
 *   3. `requestFinish()` additionally skips subagents with no active budget,
 *      a non-running status, or zero iterations/tool-calls — a just-spawned
 *      audit matches the last case.
 *
 * THE REMAINING FIX: register each in-flight audit as a session-end producer
 * (via the `waitUntil` hook) so teardown's drain actually awaits its completion.
 * That is a different mechanism from this flag, and it is still unimplemented.
 * This file guards only the wiring half; do not cite it as a survival test.
 */

const mocks = vi.hoisted(() => ({
  getSharedProjectMailbox: vi.fn(),
  startTechStackConsumer: vi.fn(),
  startPackageOutdatedWatcher: vi.fn(),
}));

vi.mock('@wrongstack/core/coordination', () => ({
  getSharedProjectMailbox: mocks.getSharedProjectMailbox,
  startTechStackConsumer: mocks.startTechStackConsumer,
  startPackageOutdatedWatcher: mocks.startPackageOutdatedWatcher,
}));

import { setupDepWatcherConsumers } from '../src/wiring/dep-watcher.js';

beforeEach(() => {
  vi.clearAllMocks();
});

/** Start the consumers and return the captured consumer options. */
function startAndCaptureSpawnOptions() {
  const mailbox = { send: vi.fn().mockResolvedValue(undefined) };
  mocks.getSharedProjectMailbox.mockReturnValue(mailbox);
  const multiAgentHost = {
    spawn: vi.fn().mockResolvedValue({ subagentId: 's', taskId: 't' }),
    // Present so the wiring's audit-tracking path does not throw.
    getDirector: vi.fn(() => ({ awaitTasks: vi.fn(async () => []) })),
  };

  setupDepWatcherConsumers({
    dwCfg: { enabled: true },
    globalRoot: 'C:/global',
    projectSlug: 'project',
    // `onPattern` is required: the wiring subscribes a `session.ended` listener
    // to register in-flight audits as session-end producers. Without it the
    // call throws inside the try block and no consumer is ever started.
    events: { emit: vi.fn(), onPattern: vi.fn(() => vi.fn()) },
    multiAgentHost,
    sessionId: 'session-1',
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    teardownHandlers: [],
    projectRoot: 'C:/repo',
  } as never);

  const consumerOptions = mocks.startTechStackConsumer.mock.calls[0]?.[0] as
    | { onSpawn: (task: string, name: string) => Promise<unknown> }
    | undefined;
  if (!consumerOptions) throw new Error('startTechStackConsumer was not called');
  return { consumerOptions, multiAgentHost };
}

describe('tech-stack audit gracefulFinish opt-in (wiring only — not a survival proof)', () => {
  it('opts the audit subagent into graceful finish at its spawn site', async () => {
    const { consumerOptions, multiAgentHost } = startAndCaptureSpawnOptions();

    await consumerOptions.onSpawn('audit the manifest', 'tech-stack-package.json');

    expect(multiAgentHost.spawn).toHaveBeenCalledTimes(1);
    const spawnOpts = multiAgentHost.spawn.mock.calls[0]?.[1] as
      | { gracefulFinish?: unknown; tools?: string[] }
      | undefined;

    // Without this the subagent is skipped by `director.requestFinish()` and
    // then hard-aborted by `terminateAll()`, losing its report.
    expect(spawnOpts?.gracefulFinish).toBe(true);
    // The audit still needs its research + reporting tools.
    expect(spawnOpts?.tools).toEqual(['read', 'fetch', 'mailbox']);
  });

  it('keeps gracefulFinish opted in on every audit, not just the first', async () => {
    const { consumerOptions, multiAgentHost } = startAndCaptureSpawnOptions();

    await consumerOptions.onSpawn('audit A', 'tech-stack-package.json');
    await consumerOptions.onSpawn('audit B', 'tech-stack-go.mod');

    expect(multiAgentHost.spawn).toHaveBeenCalledTimes(2);
    for (const call of multiAgentHost.spawn.mock.calls) {
      const opts = call[1] as { gracefulFinish?: unknown } | undefined;
      expect(opts?.gracefulFinish).toBe(true);
    }
  });
});
