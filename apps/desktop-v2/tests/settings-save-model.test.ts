import { describe, expect, it } from 'vitest';
import {
  prepareSettingsPatch,
  removeModelTier,
  sameSetting,
  validSettingsName,
} from '../src/settings-save-model';

describe('profile setting writes', () => {
  it('merges independent nested edits and retains untouched live values', () => {
    const base = {
      fallbackProfiles: { build: ['a'], review: ['b'] },
      modelMatrix: { architect: { model: 'a', modelRuntime: { cache: { ttl: '5m' } } } },
    };
    const draft = { ...base, fallbackProfiles: { ...base.fallbackProfiles, build: ['c'] } };
    const current = {
      ...base,
      fallbackProfiles: { ...base.fallbackProfiles, review: ['d'], new: ['e'] },
    };
    expect(prepareSettingsPatch(base, draft, current)).toEqual({
      fallbackProfiles: { build: ['c'], review: ['d'], new: ['e'] },
    });
    expect(base.fallbackProfiles.build).toEqual(['a']);
  });
  it('refuses a conflicting chain or a deleted entry that was edited elsewhere', () => {
    expect(() =>
      prepareSettingsPatch(
        { fallbackModels: ['a'] },
        { fallbackModels: ['b'] },
        { fallbackModels: ['c'] },
      ),
    ).toThrow(/changed elsewhere/);
    expect(() =>
      prepareSettingsPatch(
        { modelMatrix: { build: { model: 'a' } } },
        { modelMatrix: {} },
        { modelMatrix: { build: { model: 'b' } } },
      ),
    ).toThrow(/build/);
    expect(
      prepareSettingsPatch(
        { fallbackModels: ['a'] },
        { fallbackModels: ['b'] },
        { fallbackModels: ['b'] },
      ),
    ).toEqual({ fallbackModels: ['b'] });
  });
  it('removes a tier and only its known references, retaining unrelated configuration', () => {
    expect(
      removeModelTier(
        {
          enabled: true,
          default: 'fast',
          future: 17,
          levels: { fast: {}, deep: {} },
          routing: { build: 'fast', review: 'deep' },
          leader: { mode: 'propose', maxTier: 'fast', future: 3 },
        },
        'fast',
      ),
    ).toEqual({
      enabled: true,
      default: undefined,
      future: 17,
      levels: { deep: {} },
      routing: { review: 'deep' },
      leader: { mode: 'propose', future: 3 },
    });
  });
  it('compares record values without depending on key order and preserves chain order', () => {
    expect(sameSetting({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameSetting({ default: undefined, levels: {} }, { levels: {} })).toBe(true);
    expect(sameSetting(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(validSettingsName('__proto__')).toBe(false);
    expect(validSettingsName('daily review')).toBe(true);
  });
});
