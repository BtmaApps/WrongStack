import { expect, it } from 'vitest';
import {
  preferredRefinementVariant,
  prepareRefinementPolicyPatch,
} from '../src/refinement-policy-model';
import { prepareSettingsPatch } from '../src/settings-save-model';

it('keeps refiner provider/model/profile changes together rather than mixing concurrent routes', () => {
  const base = { refinerProvider: 'a', refinerModel: 'one', refinerFallbackProfile: '' },
    draft = { ...base, refinerModel: 'two' },
    current = { ...base, refinerProvider: 'b' };
  expect(() =>
    prepareRefinementPolicyPatch(base, draft, current, prepareSettingsPatch(base, draft, current)),
  ).toThrow(/routing changed elsewhere/);
  expect(
    prepareRefinementPolicyPatch(base, { ...base, refinerModel: ' one ' }, current, {
      refinerModel: ' one ',
    }),
  ).toEqual({});
  expect(prepareRefinementPolicyPatch(base, draft, base, { refinerModel: 'two' })).toEqual({
    refinerProvider: 'a',
    refinerModel: 'two',
    refinerFallbackProfile: '',
  });
  expect(
    prepareRefinementPolicyPatch(
      base,
      { ...base, refinerProvider: '', refinerModel: '' },
      base,
      {},
    ),
  ).toEqual({ refinerProvider: '', refinerModel: '', refinerFallbackProfile: '' });
});
it('refuses missing or emptied referenced profiles and preserves unrelated legacy references', () => {
  const base = { refinerFallbackProfile: '', fallbackProfiles: { chosen: ['vendor/model'] } },
    draft = { ...base, refinerFallbackProfile: 'chosen' };
  expect(
    prepareRefinementPolicyPatch(base, draft, base, { refinerFallbackProfile: 'chosen' }),
  ).toHaveProperty('refinerFallbackProfile', 'chosen');
  expect(() =>
    prepareRefinementPolicyPatch(base, { ...draft, refinerFallbackProfile: 'missing' }, base, {}),
  ).toThrow(/non-empty/);
  expect(() =>
    prepareRefinementPolicyPatch(
      base,
      draft,
      { ...base, fallbackProfiles: { chosen: ['other/model'] } },
      { refinerFallbackProfile: 'chosen' },
    ),
  ).toThrow(/profile changed elsewhere/);
  const active = { ...draft };
  expect(() =>
    prepareRefinementPolicyPatch(active, active, active, { fallbackProfiles: { chosen: [] } }),
  ).toThrow(/non-empty/);
  expect(
    prepareRefinementPolicyPatch(
      { refinerFallbackProfile: 'legacy' },
      { refinerFallbackProfile: 'legacy', enhanceEnabled: false },
      { refinerFallbackProfile: 'legacy' },
      { enhanceEnabled: false },
    ),
  ).toEqual({ enhanceEnabled: false });
});
it('uses the preferred preview language only when that version is available', () => {
  expect(preferredRefinementVariant('english', { refined: 'a', english: 'b' })).toBe('english');
  expect(preferredRefinementVariant('original', { refined: 'a', english: 'b' })).toBe('refined');
  expect(preferredRefinementVariant('english', { refined: 'a', english: '' })).toBe('refined');
});
