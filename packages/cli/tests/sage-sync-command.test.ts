import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SubcommandDeps } from '../src/subcommands/contracts.js';
import { runSageHqSyncCommand } from '../src/subcommands/handlers/sage-sync.js';

const state = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  shutdown: vi.fn(),
  close: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('../src/hq-publisher.js', () => ({ startCliHqConnection: state.start }));
vi.mock('@wrongstack/sage', () => ({
  SageProjectServerConnection: class {
    constructor(...args: unknown[]) {
      state.construct(...args);
    }
    shutdown = state.shutdown;
    close = state.close;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('WRONGSTACK_HQ_ENABLED', '1');
  state.shutdown.mockResolvedValue({ stopped: true });
  state.start.mockReturnValue({
    stop: state.stop,
    getPublisher: () => ({ project: { projectId: 'p' } }),
  });
});
afterEach(() => vi.unstubAllEnvs());
function deps() {
  return {
    projectRoot: '/project',
    config: { hq: { enabled: true }, Sage: { storage: { directory: 'custom' } } },
    renderer: { write: vi.fn(), writeError: vi.fn() },
  } as unknown as SubcommandDeps;
}
it('runs only memory synchronization and stops cleanly without restarting a service', async () => {
  const controller = new AbortController();
  const before = process.listenerCount('SIGTERM');
  const running = runSageHqSyncCommand(deps(), false, controller.signal);
  expect(state.start).toHaveBeenCalledWith(
    expect.objectContaining({
      ownKanbanSync: false,
      ownSageSync: true,
      capabilities: ['telemetry.publish'],
    }),
  );
  expect(state.shutdown).not.toHaveBeenCalled();
  controller.abort();
  expect(await running).toBe(0);
  expect(state.stop).toHaveBeenCalledOnce();
  expect(process.listenerCount('SIGTERM')).toBe(before);
});
it('restarts only the selected SAGE service when explicitly requested', async () => {
  const controller = new AbortController();
  const running = runSageHqSyncCommand(deps(), true, controller.signal);
  await vi.waitFor(() => expect(state.start).toHaveBeenCalledOnce());
  expect(state.construct).toHaveBeenCalledWith('/project', 'custom', { spawnIfMissing: false });
  expect(state.shutdown).toHaveBeenCalledOnce();
  controller.abort();
  expect(await running).toBe(0);
});
it('does not start a bridge after a failed explicit service restart', async () => {
  state.shutdown.mockResolvedValue({ stopped: false, reason: 'denied' });
  expect(await runSageHqSyncCommand(deps(), true)).toBe(1);
  expect(state.start).not.toHaveBeenCalled();
  expect(state.close).toHaveBeenCalledOnce();
});
it('honors disabled HQ before touching the SAGE service', async () => {
  vi.stubEnv('WRONGSTACK_HQ_ENABLED', '0');
  expect(await runSageHqSyncCommand(deps(), true)).toBe(1);
  expect(state.construct).not.toHaveBeenCalled();
});
