/**
 * The WebUI model switch fires the context-window updater without awaiting it,
 * so two quick switches leave two resolutions in flight. An older switch whose
 * catalog lookup finishes LAST must not publish its window over the newer
 * model's (auto-compaction would run against the wrong denominator).
 *
 * Gated completion order, no sleeps: A's catalog lookup is held until B has
 * fully resolved, then released.
 */
import { describe, expect, it } from 'vitest';
import { createMaxContextUpdater } from '../src/server/max-context-updater.js';

const WINDOWS: Record<string, number> = { 'prov-a': 1_000_000, 'prov-b': 200_000 };

function setup() {
  let releaseA!: () => void;
  const holdA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const registry = {
    ageSeconds: async () => 0,
    refresh: async () => ({}),
    getProvider: async () => undefined,
    getModel: async (providerId: string, modelId: string) => {
      if (providerId === 'prov-a') await holdA;
      return { id: modelId, providerId, capabilities: { maxContext: WINDOWS[providerId] } };
    },
    onCatalogChanged: () => () => undefined,
  };
  const compactorWindows: number[] = [];
  const context = {
    model: 'model-a',
    provider: undefined as unknown,
    meta: {} as Record<string, unknown>,
    session: { id: 'sess' },
  };
  const update = createMaxContextUpdater({
    config: { context: {} } as never,
    getConfig: () => ({ context: {}, providers: {} }) as never,
    context: context as never,
    modelsRegistry: registry as never,
    events: { emit: () => undefined } as never,
    logger: { warn: () => undefined, debug: () => undefined } as never,
    modelCapabilitiesRef: { current: undefined },
    autoCompactor: {
      setMaxContext: (n: number) => compactorWindows.push(n),
      setEnabled: () => undefined,
    } as never,
  });
  const switchTo = (id: string) => {
    const provider = { id, capabilities: { maxContext: WINDOWS[id] } };
    context.provider = provider;
    context.model = `model-${id}`;
    return update(provider as never, id, undefined);
  };
  return { switchTo, releaseA, compactorWindows, context };
}

describe('max-context updater — stale model switch', () => {
  it('keeps the newest model window when an older switch resolves last', async () => {
    const h = setup();
    const staleA = h.switchTo('prov-a');
    await h.switchTo('prov-b');
    h.releaseA();
    await staleA;

    expect(h.context.meta['effectiveMaxContext']).toBe(200_000);
    expect(h.compactorWindows).toEqual([200_000]);
  });
});
