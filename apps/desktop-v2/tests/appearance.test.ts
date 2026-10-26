import { describe, expect, it } from 'vitest';
import {
  accentThemes,
  hslHex,
  paletteColors,
  parseAppearance,
  resolvedMode,
} from '../src/appearance';

describe('workspace appearance preferences', () => {
  it('restores canonical palettes and migrates the previous desktop choices', () => {
    for (const [legacy, accent] of Object.entries({
      moss: 'moss-rust',
      ocean: 'blue-navy',
      copper: 'rose-copper',
      rose: 'purple-pink',
    }))
      expect(parseAppearance(JSON.stringify({ mode: 'light', accent: legacy }))).toEqual({
        mode: 'light',
        accent,
      });
    for (const raw of [null, undefined, '{', 'null', '[]', '"dark"'])
      expect(parseAppearance(raw)).toEqual({ mode: 'system', accent: 'blue-navy' });
    expect(parseAppearance('{"mode":"bright","accent":"purple-pink"}')).toEqual({
      mode: 'system',
      accent: 'purple-pink',
    });
    expect(parseAppearance('{"mode":"dark","accent":"url(secret)"}')).toEqual({
      mode: 'dark',
      accent: 'blue-navy',
    });
    for (const theme of accentThemes)
      expect(parseAppearance(JSON.stringify({ mode: 'dark', accent: theme.id }))).toEqual({
        mode: 'dark',
        accent: theme.id,
      });
  });
  it('follows the OS only in system mode', () => {
    expect(resolvedMode({ mode: 'system', accent: 'signal' }, true)).toBe('dark');
    expect(resolvedMode({ mode: 'system', accent: 'signal' }, false)).toBe('light');
    expect(resolvedMode({ mode: 'light', accent: 'signal' }, true)).toBe('light');
    expect(resolvedMode({ mode: 'dark', accent: 'signal' }, false)).toBe('dark');
  });
  it('resolves terminal colors and preserves the same neutral surfaces for every pair', () => {
    expect(hslHex('0 0% 100%')).toBe('#ffffff');
    expect(hslHex('120 100% 50%')).toBe('#00ff00');
    for (const mode of ['light', 'dark'] as const) {
      const colors = accentThemes.map((theme) => paletteColors({ mode, accent: theme.id }, false));
      expect(new Set(colors.map((c) => c.background)).size).toBe(1);
      expect(new Set(colors.map((c) => c.primary)).size).toBe(accentThemes.length);
      for (const color of colors)
        for (const value of Object.values(color)) expect(value).toMatch(/^#[a-f0-9]{6}$/);
    }
  });
});
