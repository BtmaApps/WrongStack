import type { Config, Provider } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import { createGoalRefinerAdapter } from '../src/server/goal-refiner-adapter.js';

function provider(id: string, text?: string): Provider {
  return {
    id,
    complete: vi.fn(async () => {
      if (!text) throw new Error('unavailable');
      return { content: [{ type: 'text', text }] } as never;
    }),
  } as never;
}

describe('Goal WebUI refiner adapter', () => {
  it('uses the configured profile before the requesting session model', async () => {
    const primary = provider('primary', 'REFINED_GOAL: Primary\nDELIVERABLES:\n- Primary proof');
    const dedicated = provider('dedicated', 'REFINED_GOAL: Dedicated\nDELIVERABLES:\n- Proof');
    const config = {
      provider: 'primary',
      model: 'primary-model',
      autonomy: { refinerFallbackProfile: 'goal-refiner' },
      fallbackProfiles: { 'goal-refiner': ['dedicated/refiner-model'] },
      favoriteModels: ['refiner-model'],
    } as unknown as Config;
    const refine = createGoalRefinerAdapter({
      config,
      primaryProvider: primary,
      primaryModel: 'primary-model',
      activeProviderId: 'primary',
      createProvider: (id) => (id === 'dedicated' ? dedicated : primary),
    });

    await expect(refine?.('Raw')).resolves.toMatchObject({
      refinedGoal: 'Dedicated',
      deliverables: ['Proof'],
    });
    expect(dedicated.complete).toHaveBeenCalledOnce();
    expect(primary.complete).not.toHaveBeenCalled();
  });

  it('falls back to the requesting session model when the dedicated refiner fails', async () => {
    const primary = provider('primary', 'REFINED_GOAL: Primary\nDELIVERABLES:\n- Proof');
    const dedicated = provider('dedicated');
    const refine = createGoalRefinerAdapter({
      config: {
        provider: 'primary',
        autonomy: { refinerProvider: 'dedicated', refinerModel: 'small-model' },
        favoriteModels: ['small-model'],
      } as unknown as Config,
      primaryProvider: primary,
      primaryModel: 'active-model',
      createProvider: (id) => (id === 'dedicated' ? dedicated : primary),
    });

    await expect(refine?.('Raw')).resolves.toMatchObject({ refinedGoal: 'Primary' });
    expect(dedicated.complete).toHaveBeenCalledOnce();
    expect(primary.complete).toHaveBeenCalledOnce();
    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'active-model' }),
      expect.any(Object),
    );
  });

  it('resolves a model-only refiner against the requesting tab provider', async () => {
    const tabProvider = provider('tab-profile', 'REFINED_GOAL: Tab\nDELIVERABLES:\n- Proof');
    const createProvider = vi.fn((id: string) => (id === 'tab-profile' ? tabProvider : undefined));
    const refine = createGoalRefinerAdapter({
      config: {
        provider: 'boot-profile',
        autonomy: { refinerModel: 'small-model' },
        favoriteModels: ['small-model'],
      } as unknown as Config,
      primaryProvider: tabProvider,
      primaryModel: 'active-model',
      activeProviderId: 'tab-profile',
      createProvider,
    });

    await expect(refine?.('Raw')).resolves.toMatchObject({ refinedGoal: 'Tab' });
    expect(createProvider).toHaveBeenCalledWith('tab-profile');
    expect(tabProvider.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'small-model' }),
      expect.any(Object),
    );
  });
});
