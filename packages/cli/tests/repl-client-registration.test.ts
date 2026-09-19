import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let finishRegistration: (() => void) | undefined;
  let registered = false;

  const registerClient = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRegistration = () => {
          registered = true;
          resolve();
        };
      }),
  );
  const deregisterClient = vi.fn(async () => {
    registered = false;
  });
  const clientHeartbeat = vi.fn(async () => undefined);
  const stop = vi.fn();

  return {
    registerClient,
    deregisterClient,
    clientHeartbeat,
    stop,
    finishRegistration: () => finishRegistration?.(),
    isRegistered: () => registered,
    resetState: () => {
      finishRegistration = undefined;
      registered = false;
    },
  };
});

vi.mock('@wrongstack/core/coordination', () => ({
  getSharedProjectMailbox: () => ({
    registerClient: mocks.registerClient,
    deregisterClient: mocks.deregisterClient,
    clientHeartbeat: mocks.clientHeartbeat,
  }),
  resolveProjectDir: (projectRoot: string) => projectRoot,
}));

vi.mock('@wrongstack/core/utils', () => ({
  wstackGlobalRoot: () => 'C:/wrongstack',
}));

vi.mock('../src/hq-publisher.js', () => ({
  startCliHqConnection: () => ({
    getPublisher: () => undefined,
    stop: mocks.stop,
  }),
}));

import { registerReplClient } from '../src/repl-client-registration.js';
import type { ReplOptions } from '../src/repl-options.js';

describe('registerReplClient', () => {
  beforeEach(() => {
    mocks.resetState();
    mocks.registerClient.mockClear();
    mocks.deregisterClient.mockClear();
    mocks.clientHeartbeat.mockClear();
    mocks.stop.mockClear();
  });

  it('removes a registration that finishes after the client has closed', async () => {
    const registration = registerReplClient({
      projectRoot: 'C:/project',
      getSessionId: () => 'session-1',
    } as ReplOptions);

    registration.close();
    await Promise.resolve();
    expect(mocks.deregisterClient).toHaveBeenCalledTimes(1);

    mocks.finishRegistration();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.isRegistered()).toBe(false);
    expect(mocks.deregisterClient).toHaveBeenCalledTimes(2);
    expect(mocks.clientHeartbeat).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });
});
