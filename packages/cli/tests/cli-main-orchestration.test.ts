import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  director: vi.fn(),
  brain: vi.fn(),
  hq: vi.fn(),
  depWatcher: vi.fn(),
  announce: vi.fn(),
  commandHost: vi.fn(),
  slash: vi.fn(),
  eternal: vi.fn(),
  dispatch: vi.fn(),
  heap: vi.fn(),
  sandbox: vi.fn(),
}));
vi.mock('@wrongstack/core/sandbox', () => ({
  createPolicySandboxApprover: vi.fn(() => 'approver'),
  setSandboxExpansionApprover: mocks.sandbox,
}));
vi.mock('../src/wiring/director-setup.js', () => ({ setupDirectorAndAutonomy: mocks.director }));
vi.mock('../src/wiring/brain-and-orchestration.js', () => ({
  setupBrainAndOrchestration: mocks.brain,
}));
vi.mock('../src/wiring/hq-telemetry.js', () => ({ setupHqTelemetry: mocks.hq }));
vi.mock('../src/wiring/dep-watcher.js', () => ({ setupDepWatcherConsumers: mocks.depWatcher }));
vi.mock('../src/wiring/director-announcement.js', () => ({
  ensureDirectorAndAnnounce: mocks.announce,
}));
vi.mock('../src/wiring/command-host-state.js', () => ({
  setupCommandHostState: mocks.commandHost,
}));
vi.mock('../src/wiring/cli-slash-commands-setup.js', () => ({
  setupCliSlashCommands: mocks.slash,
}));
vi.mock('../src/cli-eternal-flag.js', () => ({ launchEternalFromFlag: mocks.eternal }));
vi.mock('../src/wiring/runtime-dispatch-state.js', () => ({
  prepareRuntimeDispatch: mocks.dispatch,
}));
vi.mock('../src/wiring/heap-watchdog-setup.js', () => ({ setupCliHeapWatchdog: mocks.heap }));

import { wireCliOrchestration } from '../src/cli-main-orchestration.js';

function fixture(flags: Record<string, string | boolean> = {}) {
  return [
    {
      flags,
      positional: [],
      wpaths: { globalRoot: 'global' },
      container: { resolve: vi.fn() },
      configStore: { get: vi.fn() },
    },
    {
      config: {
        features: { skills: false },
        provider: 'test',
        providers: { test: { models: ['model'] } },
      },
    },
    {
      session: { id: 'session' },
      context: {},
      agent: { ctx: { meta: {} } },
      effectiveMaxContextRef: { current: 100 },
      autonomyModeRef: { current: 'off' },
    },
  ] as unknown as Parameters<typeof wireCliOrchestration>;
}

beforeEach(() => {
  mocks.director.mockReturnValue({
    director: null,
    autonomyMode: 'off',
    nextPredictEnabled: false,
    currentSuggestions: [],
    eternalEngine: null,
    parallelEngine: null,
  });
  mocks.brain.mockReturnValue({ brain: { id: 'brain' } });
  mocks.hq.mockReturnValue({ hqCommandController: {} });
  mocks.announce.mockResolvedValue({ id: 'director' });
  mocks.commandHost.mockResolvedValue({ setYoloPlusMode: vi.fn() });
  mocks.eternal.mockResolvedValue(undefined);
  mocks.dispatch.mockResolvedValue({ getToolItems: vi.fn() });
});

describe('CLI orchestration phase', () => {
  it('keeps slash-command state setters connected to the returned run state', async () => {
    const args = fixture();
    const result = await wireCliOrchestration(...args);
    expect(result.run.director).toEqual({ id: 'director' });
    const slash = mocks.slash.mock.calls[0]![0];
    slash.setAutonomyMode('auto');
    slash.setNextPredict(true);
    slash.setCurrentSuggestions(['suggestion']);
    expect(result.run).toMatchObject({
      autonomyMode: 'auto',
      nextPredictEnabled: true,
      currentSuggestions: ['suggestion'],
    });
    const nextConfig = { ...args[1].config, model: 'changed' };
    slash.onActiveProfileChange(nextConfig);
    expect(args[1].config).toBe(nextConfig);
    expect(mocks.sandbox).toHaveBeenCalledWith('approver');
    expect(mocks.heap).toHaveBeenCalledOnce();
  });

  it('adopts config and engine changes from an eternal launch', async () => {
    const engine = { id: 'engine' };
    mocks.eternal.mockImplementation(async (input) => {
      expect(input.eternalEngineRef.current).toBeUndefined();
      input.eternalEngineRef.current = engine;
      input.configRef.current = { ...input.configRef.current, model: 'eternal-model' };
    });
    const args = fixture({ eternal: '  keep working  ' });
    const result = await wireCliOrchestration(...args);
    expect(mocks.eternal.mock.calls[0]![0].eternalFlag).toBe('keep working');
    expect(result.run).toMatchObject({ autonomyMode: 'eternal', eternalEngine: engine });
    expect(args[1].config.model).toBe('eternal-model');
  });
});
