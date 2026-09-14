// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyFontSettings,
  clampFontSetting,
  DEFAULT_FONT_PRESET,
  DEFAULT_FONT_SETTINGS,
  editorFontOptions,
  FONT_FAMILIES,
  FONT_PRESETS,
  FONT_ROLE_CSS_VARIABLE,
  FONT_ROLES,
  FONT_SIZE_LIMITS,
  fallbackFontFamily,
  getFontFamily,
  isFamilyAllowedForRole,
  matchSizePreset,
  normalizeFontSettings,
  resolveFontFamilies,
  resolveFontStacks,
  SIZE_PRESETS,
  scaledPx,
  terminalFontOptions,
} from '@/lib/fonts';

const webuiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const indexCssPath = resolve(webuiRoot, 'src/index.css');
const localesDir = resolve(webuiRoot, 'src/i18n/locales');

const GENERIC_FALLBACKS = ['sans-serif', 'serif', 'monospace'];

function primaryFace(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

function lookup(source: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      source,
    );
}

describe('font registry', () => {
  it('family and preset ids are unique kebab-case', () => {
    for (const list of [FONT_FAMILIES, FONT_PRESETS]) {
      const ids = list.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('offers a broad catalog in every category', () => {
    const count = (category: string) =>
      FONT_FAMILIES.filter((family) => family.category === category).length;
    expect(count('sans')).toBeGreaterThanOrEqual(10);
    expect(count('serif')).toBeGreaterThanOrEqual(4);
    expect(count('mono')).toBeGreaterThanOrEqual(12);
    expect(FONT_PRESETS.length).toBeGreaterThanOrEqual(8);
  });

  it('every stack ends in a generic fallback', () => {
    for (const family of FONT_FAMILIES) {
      const last = family.stack.split(',').at(-1)?.trim();
      expect(GENERIC_FALLBACKS, family.id).toContain(last);
    }
  });

  it('self-hosted families point at an installed package whose face name matches the stack', () => {
    for (const family of FONT_FAMILIES) {
      if (family.source === 'system') {
        expect(family.package, family.id).toBeUndefined();
        expect(family.load, family.id).toBeUndefined();
        continue;
      }
      expect(family.package, family.id).toBeDefined();
      expect(typeof family.load === 'function', `${family.id} load`).toBe(family.source === 'lazy');
      const packageDir = resolve(webuiRoot, 'node_modules', family.package ?? '');
      const cssFile = ['index.css', '400.css']
        .map((file) => resolve(packageDir, file))
        .find((file) => existsSync(file));
      expect(cssFile, `${family.id} css entry`).toBeDefined();
      const declared = /font-family:\s*'([^']+)'/.exec(readFileSync(cssFile ?? '', 'utf8'))?.[1];
      expect(primaryFace(family.stack), family.id).toBe(declared);
    }
  });

  it('presets use families allowed for each role and have translated copy', () => {
    const en = JSON.parse(readFileSync(resolve(localesDir, 'en/settings.json'), 'utf8'));
    for (const entry of FONT_PRESETS) {
      for (const [role, id] of Object.entries(entry.families)) {
        expect(isFamilyAllowedForRole(role as never, id), `${entry.id} ${role}`).toBe(true);
      }
      for (const key of [entry.labelKey, entry.descriptionKey]) {
        expect(typeof lookup(en, key.replace(/^settings:/, '')), key).toBe('string');
      }
    }
  });

  it('the default preset is first and its base stacks match index.css', () => {
    expect(FONT_PRESETS[0]?.id).toBe(DEFAULT_FONT_PRESET);
    const css = readFileSync(indexCssPath, 'utf8');
    const stacks = resolveFontStacks(DEFAULT_FONT_SETTINGS);
    for (const role of ['ui', 'display', 'code'] as const) {
      const variable = FONT_ROLE_CSS_VARIABLE[role];
      const declarations = [...css.matchAll(new RegExp(`${variable}:\\s*([^;]+);`, 'g'))];
      expect(declarations.length, role).toBeGreaterThan(0);
      for (const [, value] of declarations) {
        expect(value?.replace(/\s+/g, ' ').trim(), role).toBe(stacks[role]);
      }
    }
    // Derived roles fall back to their parent variable in the stylesheet.
    expect(css).toContain('--font-reading: var(--font-sans);');
    expect(css).toContain('--font-editor: var(--font-mono);');
    expect(css).toContain('--font-terminal: var(--font-mono);');
  });

  it('size presets stay inside the limits and the defaults equal "normal"', () => {
    for (const entry of SIZE_PRESETS) {
      for (const [key, value] of Object.entries(entry.values)) {
        const limits = FONT_SIZE_LIMITS[key as keyof typeof FONT_SIZE_LIMITS];
        expect(value, `${entry.id} ${key}`).toBeGreaterThanOrEqual(limits.min);
        expect(value, `${entry.id} ${key}`).toBeLessThanOrEqual(limits.max);
      }
    }
    expect(matchSizePreset(DEFAULT_FONT_SETTINGS)).toBe('normal');
    expect(matchSizePreset({ ...DEFAULT_FONT_SETTINGS, editorFontSize: 21 })).toBeNull();
  });
});

describe('normalizeFontSettings', () => {
  it('falls back to the defaults for garbage', () => {
    expect(normalizeFontSettings(null)).toEqual(DEFAULT_FONT_SETTINGS);
    expect(normalizeFontSettings('modern')).toEqual(DEFAULT_FONT_SETTINGS);
    expect(normalizeFontSettings({ preset: 'comic-sans' })).toEqual(DEFAULT_FONT_SETTINGS);
  });

  it('migrates the first picker version (sans/display/mono roles)', () => {
    const settings = normalizeFontSettings({
      preset: 'plex',
      overrides: { sans: 'humanist', display: 'serif', mono: 'fira-code' },
    });
    expect(settings.preset).toBe('plex');
    expect(settings.overrides).toEqual({
      ui: 'atkinson-next',
      display: 'system-serif',
      code: 'fira-code',
    });
  });

  it('drops unknown, wrong-category, and redundant overrides', () => {
    const settings = normalizeFontSettings({
      preset: 'modern',
      overrides: {
        ui: 'inter', // equals preset
        code: 'inter', // sans family in a mono role
        editor: 'jetbrains-mono', // equals inherited code family
        terminal: 'iosevka',
        reading: 'nope',
        extra: 'geist',
      },
    });
    expect(settings.overrides).toEqual({ terminal: 'iosevka' });
  });

  it('clamps and snaps numeric settings', () => {
    const settings = normalizeFontSettings({
      uiScale: 3,
      editorFontSize: 13.4,
      terminalFontSize: 'big',
      codeLineHeight: 1.93,
      terminalLineHeight: 0.2,
      ligatures: true,
    });
    expect(settings.uiScale).toBe(FONT_SIZE_LIMITS.uiScale.max);
    expect(settings.editorFontSize).toBe(13);
    expect(settings.terminalFontSize).toBe(DEFAULT_FONT_SETTINGS.terminalFontSize);
    expect(settings.codeLineHeight).toBe(1.95);
    expect(settings.terminalLineHeight).toBe(FONT_SIZE_LIMITS.terminalLineHeight.min);
    expect(settings.ligatures).toBe(true);
    expect(clampFontSetting('uiScale', 0.93)).toBe(0.95);
  });
});

describe('resolution', () => {
  it('derived roles follow their parent until overridden', () => {
    const families = resolveFontFamilies({
      ...DEFAULT_FONT_SETTINGS,
      overrides: { code: 'fira-code', ui: 'inter' },
    });
    expect(families.reading).toBe('inter');
    expect(families.editor).toBe('fira-code');
    expect(families.terminal).toBe('fira-code');

    const pinned = resolveFontFamilies({
      ...DEFAULT_FONT_SETTINGS,
      overrides: { code: 'fira-code', terminal: 'iosevka' },
    });
    expect(pinned.editor).toBe('fira-code');
    expect(pinned.terminal).toBe('iosevka');
  });

  it('presets can pin a derived role', () => {
    const families = resolveFontFamilies({ ...DEFAULT_FONT_SETTINGS, preset: 'editorial' });
    expect(families.reading).toBe('literata');
    expect(families.ui).toBe('dm-sans');
  });

  it('fallbackFontFamily ignores the role own override', () => {
    const settings = { ...DEFAULT_FONT_SETTINGS, overrides: { editor: 'victor-mono' as const } };
    expect(fallbackFontFamily(settings, 'editor')).toBe('plex-mono');
  });

  it('builds Monaco and xterm options from the settings', () => {
    const settings = {
      ...DEFAULT_FONT_SETTINGS,
      overrides: { editor: 'cascadia-code' as const },
      editorFontSize: 15,
      codeLineHeight: 1.6,
      terminalFontSize: 12,
      terminalLineHeight: 1.1,
      ligatures: true,
    };
    expect(editorFontOptions(settings)).toEqual({
      fontFamily: getFontFamily('cascadia-code').stack,
      fontSize: 15,
      lineHeight: 24,
      fontLigatures: true,
    });
    expect(terminalFontOptions(settings)).toEqual({
      fontFamily: getFontFamily('plex-mono').stack,
      fontSize: 12,
      lineHeight: 1.1,
    });
    expect(editorFontOptions(undefined).fontSize).toBe(DEFAULT_FONT_SETTINGS.editorFontSize);
  });

  it('scaledPx follows the interface scale variable', () => {
    expect(scaledPx(11)).toBe('calc(11px * var(--ui-font-scale, 1))');
  });
});

describe('applyFontSettings', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute('style');
  });

  it('writes nothing for the defaults', () => {
    root.style.setProperty('--font-sans', 'stale');
    root.style.setProperty('--ui-font-scale', '2');
    applyFontSettings(root, DEFAULT_FONT_SETTINGS);
    expect(root.getAttribute('style') ?? '').toBe('');
  });

  it('writes changed roles, keeps inherited roles on the stylesheet, and sets detail variables', () => {
    applyFontSettings(root, {
      ...DEFAULT_FONT_SETTINGS,
      preset: 'editorial',
      overrides: { terminal: 'iosevka' },
      uiScale: 1.1,
      codeLineHeight: 1.7,
      ligatures: true,
    });
    const style = root.style;
    expect(style.getPropertyValue('--font-sans')).toBe(getFontFamily('dm-sans').stack);
    expect(style.getPropertyValue('--font-display')).toBe(getFontFamily('fraunces').stack);
    expect(style.getPropertyValue('--font-reading')).toBe(getFontFamily('literata').stack);
    expect(style.getPropertyValue('--font-mono')).toBe(getFontFamily('commit-mono').stack);
    // editor follows code → no inline property; terminal is pinned.
    expect(style.getPropertyValue('--font-editor')).toBe('');
    expect(style.getPropertyValue('--font-terminal')).toBe(getFontFamily('iosevka').stack);
    expect(style.getPropertyValue('--ui-font-scale')).toBe('1.1');
    expect(style.getPropertyValue('--code-line-height')).toBe('1.7');
    expect(style.getPropertyValue('--code-font-features')).toContain('"liga" 1');
  });

  it('every role maps to a distinct CSS variable', () => {
    const variables = FONT_ROLES.map((role) => FONT_ROLE_CSS_VARIABLE[role]);
    expect(new Set(variables).size).toBe(FONT_ROLES.length);
  });
});
