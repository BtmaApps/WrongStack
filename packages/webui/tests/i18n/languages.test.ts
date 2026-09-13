/**
 * Tests for src/i18n/languages.ts — locale detection and normalization.
 * Pure module with no i18next/react dependencies.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  detectLocale,
  FALLBACK_LNG,
  LANGUAGES,
  normalizeLocale,
  SUPPORTED_LNGS,
} from '../../src/i18n/languages';

describe('SUPPORTED_LNGS', () => {
  it('contains en as the first entry', () => {
    expect(SUPPORTED_LNGS[0]).toBe('en');
  });

  it('has en, tr, de, fr, it, es, pt-BR', () => {
    expect(SUPPORTED_LNGS).toEqual(['en', 'tr', 'de', 'fr', 'it', 'es', 'pt-BR']);
  });
});

describe('FALLBACK_LNG', () => {
  it('is en', () => {
    expect(FALLBACK_LNG).toBe('en');
  });
});

describe('LANGUAGES', () => {
  it('has the correct number of entries', () => {
    expect(LANGUAGES).toHaveLength(7);
  });

  it('each entry has code and name', () => {
    for (const lang of LANGUAGES) {
      expect(lang).toHaveProperty('code');
      expect(lang).toHaveProperty('name');
    }
  });
});

describe('detectLocale', () => {
  const originalLanguage = navigator.language;

  afterEach(() => {
    // Restore navigator.language
    Object.defineProperty(navigator, 'language', {
      value: originalLanguage,
      configurable: true,
    });
  });

  it('returns a supported locale when navigator.language is an exact match', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'tr',
      configurable: true,
    });
    expect(detectLocale()).toBe('tr');
  });

  it('returns the primary subtag match for region-specific locales', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'de-AT',
      configurable: true,
    });
    expect(detectLocale()).toBe('de');
  });

  it('returns pt-BR for pt-PT and other Portuguese variants', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'pt-PT',
      configurable: true,
    });
    expect(detectLocale()).toBe('pt-BR');
  });

  it('returns en for unsupported languages', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'ja-JP',
      configurable: true,
    });
    expect(detectLocale()).toBe('en');
  });

  it('returns en when navigator is undefined', () => {
    // Simulate SSR: no navigator. jsdom's `navigator` is a getter-only own/
    // prototype property, so plain assignment throws; shadow it with a
    // configurable property and restore it in a finally so later cases (and
    // the shared afterEach) still see a real navigator.
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', {
        get: () => undefined,
        configurable: true,
      });
      expect(detectLocale()).toBe('en');
    } finally {
      if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it('returns en when navigator.language is empty', () => {
    Object.defineProperty(navigator, 'language', {
      value: '',
      configurable: true,
    });
    expect(detectLocale()).toBe('en');
  });
});

describe('normalizeLocale', () => {
  it('returns detectLocale() for null input', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'de',
      configurable: true,
    });
    expect(normalizeLocale(null)).toBe('de');
  });

  it('returns detectLocale() for undefined input', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'fr',
      configurable: true,
    });
    expect(normalizeLocale(undefined)).toBe('fr');
  });

  it('returns detectLocale() for empty string', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'it',
      configurable: true,
    });
    expect(normalizeLocale('')).toBe('it');
  });

  it('passes through an exact match', () => {
    expect(normalizeLocale('fr')).toBe('fr');
  });

  it('matches primary subtag for region-specific', () => {
    expect(normalizeLocale('de-DE')).toBe('de');
  });

  it('maps pt-* to pt-BR', () => {
    expect(normalizeLocale('pt-PT')).toBe('pt-BR');
  });

  it('returns en for completely unsupported locale', () => {
    expect(normalizeLocale('zh-CN')).toBe('en');
  });

  it('trims whitespace around the tag', () => {
    expect(normalizeLocale('  tr  ')).toBe('tr');
  });

  it('handles case-insensitive matching', () => {
    expect(normalizeLocale('TR')).toBe('tr');
  });

  it('handles whitespace-only tag that trims to empty (line 67)', () => {
    expect(normalizeLocale('   ')).toBe(FALLBACK_LNG);
  });
});
