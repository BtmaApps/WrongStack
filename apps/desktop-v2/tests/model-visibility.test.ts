import { isModelRefListed } from '@wrongstack/core/models';
import { describe, expect, it } from 'vitest';
import {
  disableModelPatch,
  modelRefMatches,
  providerDisabled,
  providerVisibilityPatch,
  selectableCatalogModels,
} from '../src/model-visibility';
import { prepareSettingsPatch } from '../src/settings-save-model';

describe('profile model visibility', () => {
  it('enables and disables providers case-insensitively without modifying models, favorites or routes', () => {
    const base = {
      disabledProviders: ['Other', ' P ', 'p'],
      disabledModels: ['p/model'],
      favoriteModels: ['p/model'],
      fallbackModels: ['p/model'],
      fallbackProfiles: { review: ['p/model'] },
      leaderModel: 'p/model',
    };
    expect(providerDisabled(base.disabledProviders, 'P')).toBe(true);
    expect(providerVisibilityPatch(base, 'P', true)).toEqual({
      disabledProviders: base.disabledProviders,
    });
    expect(providerVisibilityPatch(base, 'p', false)).toEqual({ disabledProviders: ['Other'] });
    const enabled = { ...base, ...providerVisibilityPatch(base, 'p', false) };
    expect(enabled.disabledModels).toEqual(['p/model']);
    expect(enabled.favoriteModels).toBe(base.favoriteModels);
    expect(enabled.fallbackProfiles).toBe(base.fallbackProfiles);
    expect(
      selectableCatalogModels([{ id: 'model' }, { id: 'new-model' }], 'p', enabled).map(
        (item) => item.id,
      ),
    ).toEqual(['new-model']);
  });
  it('checks provider exclusion conflicts separately from other live preferences', () => {
    const base = { disabledProviders: [], favoriteModels: ['p/model'] };
    const draft = { ...base, ...providerVisibilityPatch(base, 'p', true) };
    expect(prepareSettingsPatch(base, draft, { ...base, favoriteModels: ['q/model'] })).toEqual({
      disabledProviders: ['p'],
    });
    expect(() => prepareSettingsPatch(base, draft, { ...base, disabledProviders: ['q'] })).toThrow(
      'changed elsewhere',
    );
    expect(selectableCatalogModels([{ id: 'future-model' }], 'p', draft)).toEqual([]);
  });
  it('excludes disabled models before ranking favorites and keeps the source catalog intact', () => {
    const models = [{ id: 'normal' }, { id: 'favorite' }, { id: 'off' }];
    expect(
      selectableCatalogModels(models, 'p', {
        disabledModels: ['off'],
        favoriteModels: ['p/off', 'p/favorite'],
      }).map((model) => model.id),
    ).toEqual(['favorite', 'normal']);
    expect(selectableCatalogModels(models, 'p', { disabledProviders: [' P '] })).toEqual([]);
    expect(models.map((model) => model.id)).toEqual(['normal', 'favorite', 'off']);
  });
  it('uses the engine reference grammar for bare, qualified and slash-containing model IDs', () => {
    for (const raw of [
      '',
      'model',
      ' P / model ',
      'p model',
      'q/model',
      'vendor/model',
      'p/vendor/model',
      'p vendor/model',
      'p  vendor/model',
      ' q vendor/model ',
    ]) {
      for (const model of ['model', 'vendor/model', ''])
        expect(modelRefMatches(raw, 'p', model)).toBe(isModelRefListed('p', model, [raw]));
    }
  });
  it('removes only reviewed fallback references while retaining other providers and role overrides', () => {
    const base = {
      disabledModels: ['other/model'],
      favoriteModels: ['p/vendor/model', 'q/vendor/model'],
      fallbackModels: ['p vendor/model', 'q/vendor/model', 'vendor/model'],
      fallbackProfiles: { review: ['p/vendor/model', 'q/vendor/model'] },
      leaderModel: 'p/vendor/model',
    };
    const patch = disableModelPatch(base, 'p', 'vendor/model', 'q');
    expect(patch.disabledModels).toEqual(['other/model', 'p/vendor/model']);
    expect(patch.favoriteModels).toEqual(['q/vendor/model']);
    expect(patch.fallbackModels).toEqual(['q/vendor/model', 'vendor/model']);
    expect(patch.fallbackProfiles).toEqual({ review: ['q/vendor/model'] });
    expect(base.leaderModel).toBe('p/vendor/model');
    expect(disableModelPatch(base, 'p', 'vendor/model', 'p').fallbackModels).toEqual([
      'q/vendor/model',
    ]);
  });
  it('refuses a concurrent exclusion edit and preserves unrelated live settings', () => {
    const base = {
      disabledModels: [],
      favoriteModels: [],
      fallbackModels: [],
      fallbackProfiles: {},
      other: true,
    };
    const draft = { ...base, ...disableModelPatch(base, 'p', 'model', 'p') };
    expect(() =>
      prepareSettingsPatch(base, draft, { ...base, disabledModels: ['q/model'] }),
    ).toThrow('changed elsewhere');
    expect(prepareSettingsPatch(base, draft, { ...base, other: false })).toEqual({
      disabledModels: ['p/model'],
    });
  });
});
