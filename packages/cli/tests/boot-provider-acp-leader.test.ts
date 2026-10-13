/**
 * A session saved with an ACP agent as its leader (`/model acp/claude-code`
 * persists the pair) starts with it again: the agent has no catalog entry and
 * no key, so the catalog checks would otherwise send the user to the picker.
 */
import { describe, expect, it, vi } from 'vitest';
import { validateSavedProviderModel } from '../src/boot-provider-selection.js';

describe('validateSavedProviderModel', () => {
  it('accepts a saved ACP leader without consulting the catalog', async () => {
    const getProvider = vi.fn(async () => undefined);
    await expect(
      validateSavedProviderModel(
        { provider: 'acp', model: 'claude-code' } as never,
        {
          getProvider,
        } as never,
      ),
    ).resolves.toEqual({ ok: true });
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('still rejects a provider the catalog and config do not know', async () => {
    await expect(
      validateSavedProviderModel(
        { provider: 'nope', model: 'x' } as never,
        {
          getProvider: async () => undefined,
        } as never,
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});
