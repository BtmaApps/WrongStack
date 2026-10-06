import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function harness(dwCfg?: Record<string, unknown>) {
  const teardownHandlers: Array<() => void> = [];
  const mailbox = { send: vi.fn().mockResolvedValue(undefined) };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const multiAgentHost = {
    spawn: vi.fn().mockResolvedValue({ id: 'spawned', subagentId: 's', taskId: 't' }),
    // The wiring tracks each spawned audit so session teardown can await it.
    getDirector: vi.fn(() => ({ awaitTasks: vi.fn(async () => []) })),
  };
  const deps = {
    dwCfg,
    globalRoot: 'C:/global',
    projectSlug: 'project',
    // `onPattern` is required: the wiring subscribes a `session.ended`
    // listener to register in-flight audits as teardown producers. Without it
    // the call throws inside the try block and no consumer is ever started.
    events: { emit: vi.fn(), onPattern: vi.fn(() => vi.fn()) },
    multiAgentHost,
    sessionId: 'session-1',
    logger,
    teardownHandlers,
    projectRoot: 'C:/repo',
  };
  mocks.getSharedProjectMailbox.mockReturnValue(mailbox);
  return { deps, logger, mailbox, multiAgentHost, teardownHandlers };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupDepWatcherConsumers', () => {
  it('does nothing when dependency watching is explicitly disabled', () => {
    setupDepWatcherConsumers(harness({ enabled: false }).deps as never);

    expect(mocks.getSharedProjectMailbox).not.toHaveBeenCalled();
    expect(mocks.startTechStackConsumer).not.toHaveBeenCalled();
    expect(mocks.startPackageOutdatedWatcher).not.toHaveBeenCalled();
  });

  // Behaviour change (2026-10-05): dep watching is now ON when unconfigured.
  // The gate reads host config, never the plugin's merged `defaultConfig`, so
  // "absent" has to mean enabled or the documented default would be a no-op.
  it('starts by default when no config is present', () => {
    mocks.startTechStackConsumer.mockReturnValue(vi.fn());
    mocks.startPackageOutdatedWatcher.mockReturnValue(vi.fn());

    setupDepWatcherConsumers(harness().deps as never);

    expect(mocks.startTechStackConsumer).toHaveBeenCalledTimes(1);
    expect(mocks.startPackageOutdatedWatcher).toHaveBeenCalledTimes(1);
  });

  it('starts both consumers with defaults and registers their disposers', async () => {
    const techDispose = vi.fn();
    const packageDispose = vi.fn();
    mocks.startTechStackConsumer.mockReturnValue(techDispose);
    mocks.startPackageOutdatedWatcher.mockReturnValue(packageDispose);
    const harnessed = harness({ enabled: true });

    setupDepWatcherConsumers(harnessed.deps as never);

    // Order: the tech-stack consumer's session-end listener is registered as its
    // own teardown handler right after it starts, then the package watcher and
    // the tech-stack consumer disposers are appended at the end.
    expect(harnessed.teardownHandlers).toHaveLength(3);
    expect(harnessed.teardownHandlers[1]).toBe(packageDispose);
    expect(harnessed.teardownHandlers[2]).toBe(techDispose);
    // Calling every handler must tear the session-end subscription down too.
    for (const dispose of harnessed.teardownHandlers) dispose();
    expect(harnessed.deps.events.onPattern).toHaveBeenCalledWith(
      'session.ended',
      expect.any(Function),
    );
    expect(mocks.getSharedProjectMailbox).toHaveBeenCalledTimes(2);
    const techOptions = mocks.startTechStackConsumer.mock.calls[0]?.[0];
    expect(techOptions).toEqual(
      expect.objectContaining({
        targetAgent: 'tech-stack',
        consumerAgentId: 'tech-stack-consumer',
        pollIntervalMs: 5_000,
        sessionId: 'session-1',
        currentAgentId: 'leader',
        fileAuthorOpts: {
          storageDir: expect.stringContaining('projects'),
          projectRoot: 'C:/repo',
        },
      }),
    );
    // `objectContaining`, not exact equality: the wiring returns the spawn result
    // verbatim because it reads `spawned.taskId` to track the audit for
    // session-end drain. A stale single-key `toEqual` fails on the extra fields.
    await expect(techOptions.onSpawn('upgrade dependencies', 'Dep Agent')).resolves.toEqual(
      expect.objectContaining({ id: 'spawned', taskId: 't' }),
    );
    expect(harnessed.multiAgentHost.spawn).toHaveBeenCalledWith('upgrade dependencies', {
      name: 'Dep Agent',
      tools: ['read', 'fetch', 'mailbox'],
      // The audit is background work whose deliverable is a mailbox report, so
      // it must survive leader turn completion. Without this opt-in it is
      // skipped by `director.requestFinish()` and hard-aborted by
      // `terminateAll()`, reporting `aborted_by_parent` instead of its findings.
      // Pinned here and in tech-stack-audit-survives-teardown.test.ts.
      gracefulFinish: true,
    });
    techOptions.onLog('tech log');
    techOptions.onError(new Error('tech error'));
    techOptions.onError('tech string error');
    expect(harnessed.logger.debug).toHaveBeenCalledWith('tech log');
    expect(harnessed.logger.warn).toHaveBeenCalledWith('Tech-stack consumer error: tech error');

    const packageOptions = mocks.startPackageOutdatedWatcher.mock.calls[0]?.[0];
    expect(packageOptions).toEqual(
      expect.objectContaining({
        pollIntervalMs: 60 * 60 * 1_000,
        watcherAgentId: 'pkg-outdated-watcher',
      }),
    );
    const notification = {
      from: 'watcher',
      to: 'agent',
      subject: 'Outdated',
      body: 'Upgrade',
      priority: 'normal',
    };
    await packageOptions.onNotify(notification);
    expect(harnessed.mailbox.send).toHaveBeenCalledWith({
      ...notification,
      type: 'note',
    });
    packageOptions.onLog('package log');
    packageOptions.onError('package error');
    packageOptions.onError(new Error('package object error'));
    expect(harnessed.logger.warn).toHaveBeenCalledWith('Pkg-outdated-watcher error: package error');
    expect(harnessed.logger.warn).toHaveBeenCalledWith(
      'Pkg-outdated-watcher error: package object error',
    );
  });

  it('uses configured target and polling values', () => {
    const harnessed = harness({
      enabled: true,
      targetAgent: 'custom-agent',
      pollIntervalMs: 123,
    });
    mocks.startTechStackConsumer.mockReturnValue(undefined);
    mocks.startPackageOutdatedWatcher.mockReturnValue(undefined);

    setupDepWatcherConsumers(harnessed.deps as never);

    expect(mocks.startTechStackConsumer).toHaveBeenCalledWith(
      expect.objectContaining({ targetAgent: 'custom-agent', pollIntervalMs: 123 }),
    );
    expect(mocks.startPackageOutdatedWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ pollIntervalMs: 123 }),
    );
    // `startTechStackConsumer` returned no disposer, but the session-end listener
    // WAS registered — so exactly its unsubscribe lands in teardownHandlers.
    // Leaking it would keep a dead consumer's in-flight audit set alive.
    expect(harnessed.teardownHandlers).toHaveLength(1);
    harnessed.teardownHandlers[0]!();
  });

  it('contains independent startup failures for both watchers', () => {
    const harnessed = harness({ enabled: true });
    mocks.getSharedProjectMailbox
      .mockImplementationOnce(() => {
        throw new Error('tech startup');
      })
      .mockImplementationOnce(() => {
        throw new Error('package startup');
      });

    expect(() => setupDepWatcherConsumers(harnessed.deps as never)).not.toThrow();
    expect(harnessed.logger.warn).toHaveBeenCalledWith(
      'Failed to start tech-stack consumer: Error: tech startup',
    );
    expect(harnessed.logger.warn).toHaveBeenCalledWith(
      'Failed to start package outdated watcher: Error: package startup',
    );
  });
});
