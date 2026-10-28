import { describe, expect, it } from 'vitest';
import {
  emptyModelPolicy,
  mergeModelPolicy,
  readProfileModelPolicy,
} from '../src/profile-model-policy';

describe('profile model policy projection', () => {
  it('preserves policy on scoped updates and excludes session preferences from the projection', () => {
    const first = mergeModelPolicy(
      emptyModelPolicy(),
      {
        disabledProviders: ['off'],
        favoriteModels: ['p/m'],
        disabledModels: ['p/other'],
        reasoningEffort: 'low',
      },
      true,
    );
    expect(first).toEqual({
      disabledProviders: ['off'],
      favoriteModels: ['p/m'],
      disabledModels: ['p/other'],
    });
    expect(mergeModelPolicy(first, { reasoningEffort: 'high', sessionId: 'different' })).toEqual(
      first,
    );
    const changed = mergeModelPolicy(first, { favoriteModels: [] });
    expect(changed.disabledProviders).toEqual(['off']);
    expect(first.favoriteModels).toEqual(['p/m']);
  });
  it('requires a complete valid profile read instead of assuming an empty policy', async () => {
    const complete = await readProfileModelPolicy(async (type, payload, replies) => {
      expect(type).toBe('prefs.get');
      expect(payload).toEqual({});
      expect(replies).toEqual(['prefs.updated']);
      return { favoriteModels: ['p/m'], disabledModels: [], disabledProviders: [] };
    });
    expect(complete.favoriteModels).toEqual(['p/m']);
    await expect(readProfileModelPolicy(async () => ({ favoriteModels: [] }))).rejects.toThrow(
      'invalid model policy',
    );
    expect(() => mergeModelPolicy(complete, { disabledModels: [4] })).toThrow(
      'invalid model policy',
    );
  });
});
