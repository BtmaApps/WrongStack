import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILIES,
  FONT_ROLES,
  fontFamiliesForRole,
  isFamilyAllowedForRole,
  isFontFamilyId,
  normalizeFontSettings,
} from '@/lib/fonts';

/**
 * Harness: can `FontSettingsTab`'s font-override select ever bind to a family
 * that `fontFamiliesForRole(role)` does not offer?
 *
 * The select binds `settings.overrides[role]` and offers exactly
 * `fontFamiliesForRole(role)`. A `<select value={X}>` with no matching
 * `<option>` does not render blank — the DOM reports the FIRST option — so
 * such a binding would silently display, and on re-pick silently write, a
 * different family than the one configured. This is the same defect class that
 * was real in ModelTiersSection's profile picker.
 *
 * The answer rests on two invariants, asserted here rather than assumed:
 *
 *  1. `fontFamiliesForRole` is NOT a host-detected catalog. It filters the
 *     static bundled `FONT_FAMILIES` registry, so its membership is identical
 *     on every machine. There is no "font uninstalled here", "different host",
 *     or synced-config path that can remove an entry.
 *  2. `normalizeFontSettings` retains an override only when it is a real family
 *     id (isFontFamilyId) AND allowed for that role (isFamilyAllowedForRole).
 *     `isFamilyAllowedForRole` is the SAME category predicate
 *     `fontFamiliesForRole` filters on, so a retained override is in the
 *     option list by construction.
 *
 * Every path into `useConfigStore.fonts` runs that normalizer: the initial
 * state is DEFAULT_FONT_SETTINGS, `setFonts` normalizes (config-store.ts:86),
 * and the zustand-persist `merge` normalizes rehydrated/legacy/corrupt values
 * (config-store.ts:134). The single raw `setConfig` spread
 * (use-brain-section.tsx:69) receives a `BrainConfigWire` — risk levels,
 * timeouts, voters — which has no `fonts` field.
 */

/** The catalog a role's select offers. */
const offeredFor = (role: (typeof FONT_ROLES)[number]) =>
  fontFamiliesForRole(role).map((family) => family.id);

describe('font-override catalog — the select always offers its bound value', () => {
  it('offers a static bundled registry, not a per-host detected list', () => {
    // Invariant 1. If this ever became host-detected, invariant 2 would no
    // longer cover a machine that lacks a font.
    const registryIds = new Set(FONT_FAMILIES.map((family) => family.id));
    for (const role of FONT_ROLES) {
      const offered = offeredFor(role);
      expect(new Set(offered).size).toBe(offered.length);
      for (const id of offered) {
        expect(isFontFamilyId(id)).toBe(true);
        expect(registryIds.has(id)).toBe(true);
      }
    }
  });

  it("retains only overrides the role's select can offer (all roles x all families)", () => {
    // The property under test, checked against the real normalizer for every
    // (role, family) pair in the registry.
    for (const role of FONT_ROLES) {
      const offered = new Set(offeredFor(role));
      for (const family of FONT_FAMILIES) {
        const normalized = normalizeFontSettings({
          ...DEFAULT_FONT_SETTINGS,
          overrides: { [role]: family.id },
        });
        const bound = normalized.overrides[role];
        if (bound === undefined) continue;
        expect(offered.has(bound)).toBe(true);
      }
    }
  });

  it('makes allowance and offeredness coincide for every role/family pair', () => {
    // Disallowed pairs DO exist — a sans or serif family pinned to a mono-only
    // role (code/editor/terminal) is rejected. The load-bearing fact is that
    // `isFamilyAllowedForRole` is the SAME predicate `fontFamiliesForRole`
    // filters on, so "allowed" and "offered" can never diverge for a pair.
    const categories = new Set(FONT_FAMILIES.map((family) => family.category));
    expect(categories).toContain('mono');
    for (const role of FONT_ROLES) {
      for (const family of FONT_FAMILIES) {
        expect(isFamilyAllowedForRole(role, family.id)).toBe(offeredFor(role).includes(family.id));
      }
    }
  });

  it('drops a serif family pinned to the mono-only code role', () => {
    // The realistic hostile input: a role whose category filter excludes the
    // pinned family. It must be discarded, because retaining it would leave the
    // select bound to an option it cannot render.
    const serif = FONT_FAMILIES.find((family) => family.category === 'serif');
    expect(serif).toBeDefined();
    expect(isFamilyAllowedForRole('code', serif!.id)).toBe(false);
    expect(
      normalizeFontSettings({ overrides: { code: serif!.id } }).overrides.code,
    ).toBeUndefined();
  });

  it.each([
    ['an unknown family id', { overrides: { ui: 'not-a-real-font' } }],
    ['a legacy 3-role key', { overrides: { sans: 'humanist' } }],
    ['a legacy family id', { overrides: { ui: 'serif' } }],
    ['a non-object overrides', { overrides: 'ui' }],
    ['a null override value', { overrides: { ui: null } }],
    ['a numeric override value', { overrides: { ui: 42 } }],
    ['an unknown role key', { overrides: { nonsense: 'system-sans' } }],
    ['a non-object settings blob', 'not-an-object'],
    ['null settings', null],
  ])('leaves no unoffered family bound from %s', (_label, raw) => {
    const normalized = normalizeFontSettings(raw);
    for (const role of FONT_ROLES) {
      const bound = normalized.overrides[role];
      if (bound === undefined) continue;
      expect(offeredFor(role)).toContain(bound);
    }
  });

  it('has teeth: the checks would fail for an unnormalized settings object', () => {
    // Guards against a vacuous suite. Bypassing the normalizer with an id the
    // registry does not contain is exactly the condition the real write paths
    // prevent; assert it WOULD bind to an unoffered option, so the property
    // assertions above are discriminating rather than trivially true.
    const canary = {
      ...DEFAULT_FONT_SETTINGS,
      overrides: { ui: 'not-a-real-font' },
    } as unknown as (typeof DEFAULT_FONT_SETTINGS)['overrides'];

    // The canary value is genuinely unoffered...
    expect(offeredFor('ui')).not.toContain(canary.ui);
    // ...so a select bound to it would report the first option, not the value.
    expect(canary.ui).not.toBe(offeredFor('ui')[0]);
    // ...and the real normalizer is what prevents it from ever being stored.
    expect(
      normalizeFontSettings({ ...DEFAULT_FONT_SETTINGS, overrides: canary }).overrides.ui,
    ).toBeUndefined();
  });
});
