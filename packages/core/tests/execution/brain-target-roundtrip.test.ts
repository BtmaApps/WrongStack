import type { BrainConfig } from '@wrongstack/contracts/types/config';
import type { Provider } from '@wrongstack/contracts/types/provider';
import { expect, it, vi } from 'vitest';
import { createBrainRuntime } from '../../src/execution/brain-runtime.js';

function boot(initialConfig: BrainConfig, persist?: (config: BrainConfig) => Promise<void>) {
  const provider = {
    id: 'fixture',
    capabilities: {},
    stream: vi.fn(),
    complete: vi.fn(),
  } as unknown as Provider;
  return createBrainRuntime({
    initialConfig,
    defaultProviderId: 'fixture',
    sessionProvider: () => provider,
    sessionModel: () => 'fixture',
    resolveProvider: () => provider,
    ...(persist ? { persist } : {}),
  });
}
it('keeps unambiguous qualified model references compact across runtime restarts', async () => {
  let saved: BrainConfig = {};
  const runtime = boot({ models: [{ provider: 'vendor', model: 'model' }] }, async (config) => {
    saved = config;
  });
  expect(await runtime.apply({ cache: { enabled: true } }).persisted).toEqual({ ok: true });
  expect(saved.models).toEqual(['vendor/model']);
  expect(boot(saved).getSnapshot().models).toEqual(runtime.getSnapshot().models);
});
it('reports the configured trace record capacity rather than hiding it behind a client default', () => {
  expect(boot({ trace: { maxOpenRecords: 777 } }).getSnapshot().trace.maxOpenRecords).toBe(777);
  expect(boot({}).getSnapshot().trace.maxOpenRecords).toBe(200);
});
it('preserves inherited-provider namespaced model identities in pools, voters and judge after restart', async () => {
  let saved: BrainConfig = {};
  const runtime = boot(
    {
      models: [{ model: 'org/pool-model' }],
      council: { voters: [{ model: 'org/voter' }], judge: { model: 'org/judge' } },
    },
    async (config) => {
      saved = config;
    },
  );
  expect(await runtime.apply({ cache: { enabled: true } }).persisted).toEqual({ ok: true });
  const restarted = boot(JSON.parse(JSON.stringify(saved))).getSnapshot();
  expect(restarted.models).toEqual(runtime.getSnapshot().models);
  expect(restarted.council.voters).toEqual(runtime.getSnapshot().council.voters);
  expect(restarted.council.judge).toEqual(runtime.getSnapshot().council.judge);
});
