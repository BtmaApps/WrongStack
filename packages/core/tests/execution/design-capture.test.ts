import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  captureProjectTokens,
  normalizeCssValue,
  parseCssTokens,
  parseDartTokens,
  parseTsThemeTokens,
} from '../../src/execution/design-capture.js';
import {
  clearCapturedTokens,
  clearPersistedActiveKit,
  loadCapturedTokens,
  recordKitChoice,
  resolveVerifyTokens,
  saveCapturedTokens,
} from '../../src/execution/design-project-store.js';

describe('normalizeCssValue', () => {
  it('wraps shadcn HSL channel triplets and converts hsl()/rgb() to hex', () => {
    expect(normalizeCssValue('222 47% 11%')).toMatch(/^#[0-9a-f]{6}$/);
    expect(normalizeCssValue('hsl(222 47% 11%)')).toMatch(/^#[0-9a-f]{6}$/);
    expect(normalizeCssValue('rgb(255, 0, 0)')).toBe('#ff0000');
    // Already colorToHex-parsable forms pass through verbatim.
    expect(normalizeCssValue('oklch(62% 0.2 25)')).toBe('oklch(62% 0.2 25)');
    expect(normalizeCssValue('#abcdef')).toBe('#abcdef');
  });

  it('rejects non-color values instead of guessing', () => {
    expect(normalizeCssValue('var(--primary)')).toBeNull();
    expect(normalizeCssValue('1.5rem')).toBeNull();
    expect(normalizeCssValue('linear-gradient(90deg, #fff, #000)')).toBeNull();
    expect(normalizeCssValue('Inter, sans-serif')).toBeNull();
    expect(normalizeCssValue('')).toBeNull();
  });
});

describe('parseCssTokens', () => {
  const css = [
    ':root {',
    '  --primary: 222 47% 11%;',
    '  --background: oklch(99% 0 0);',
    '  --radius-md: 0.5rem;',
    '}',
    '.dark {',
    '  --primary: 210 40% 96%;',
    '}',
    '@theme inline {',
    '  --color-accent: #ff5500;',
    '}',
    '',
  ].join('\n');

  it('splits light/dark contexts, strips --color- prefixes, skips non-colors', () => {
    const r = parseCssTokens(css);
    expect(r.light['primary']).toMatch(/^#/);
    expect(r.light['background']).toBe('oklch(99% 0 0)');
    expect(r.light['accent']).toBe('#ff5500'); // from @theme, --color- prefix stripped
    expect(r.light['radius-md']).toBeUndefined(); // scale length, not a color
    expect(r.dark['primary']).toMatch(/^#/);
    expect(r.dark['primary']).not.toBe(r.light['primary']);
    expect(r.unparsed).toBe(1);
  });

  it('records [data-palette] variant blocks separately so the base stays clean', () => {
    const css = [
      ':root {',
      '  --primary: 222 47% 11%;',
      '  --background: #ffffff;',
      '}',
      '.dark {',
      '  --primary: 210 40% 96%;',
      '}',
      "[data-palette='signal'] {",
      '  --primary: 346.8 77.2% 49.8%;',
      '  --radius-md: 0.5rem;',
      '}',
      '',
    ].join('\n');
    const r = parseCssTokens(css);
    // The variant must NOT stomp the base light/dark capture.
    expect(r.palettes['signal']).toBeDefined();
    expect(r.palettes['signal']?.['primary']).toMatch(/^#/);
    expect(r.palettes['signal']?.['primary']).not.toBe(r.light['primary']);
    expect(r.palettes['signal']?.['radius-md']).toBeUndefined(); // non-color
    expect(r.light['background']).toBe('#ffffff');
    expect(r.dark['primary']).toMatch(/^#/);
    expect(Object.keys(r.palettes)).toEqual(['signal']);
    expect(r.unparsed).toBe(1); // the variant's radius declaration
  });

  it('records stock shadow utility redefinitions as raw markers, not unparsed', () => {
    const css = [
      '@theme {',
      '  --shadow-sm: 0 1px 3px 0 hsl(var(--shadow-color) / 0.1);',
      '  --shadow-lg: 0 10px 15px -3px hsl(var(--shadow-color) / 0.1);',
      '  --radius-md: 0.5rem;',
      '}',
      '',
    ].join('\n');
    const r = parseCssTokens(css);
    // Raw markers kept verbatim — their presence marks the @theme remap.
    expect(r.light['shadow-sm']).toContain('0 1px 3px');
    expect(r.light['shadow-lg']).toContain('0 10px 15px');
    expect(r.light['shadow-md']).toBeUndefined(); // only what was declared
    // Non-shadow non-colors are still skipped and counted.
    expect(r.unparsed).toBe(1);
  });
});

describe('parseTsThemeTokens', () => {
  it('extracts lightTheme/darkTheme object literals', () => {
    const ts = [
      'export const lightTheme = {',
      "  primary: '#0f172a',",
      '  bg: "#ffffff",',
      '} as const;',
      '',
      'export const darkTheme = {',
      "  primary: '#e2e8f0',",
      '} as const;',
      '',
    ].join('\n');
    const r = parseTsThemeTokens(ts);
    expect(r.light).toEqual({ primary: '#0f172a', bg: '#ffffff' });
    expect(r.dark).toEqual({ primary: '#e2e8f0' });
  });

  it('notes when no theme objects are found', () => {
    const r = parseTsThemeTokens('export const x = 1;\n');
    expect(r.light).toEqual({});
    expect(r.notes[0]).toMatch(/no lightTheme\/darkTheme/);
  });
});

describe('parseDartTokens', () => {
  it('captures named params and class fields, split by light/dark context', () => {
    const dart = [
      'class AppColorsLight {',
      '  static const Color primary = Color(0xFF1B1B1F);',
      '}',
      '',
      'class AppColorsDark {',
      '  static const Color primary = Color(0xFFE6E1E5);',
      '}',
      '',
      'final darkScheme = ColorScheme.dark(',
      '  secondary: Color(0xFFD0BCFF),',
      ');',
      '',
    ].join('\n');
    const r = parseDartTokens(dart);
    expect(r.light['primary']).toBe('#1b1b1f');
    expect(r.dark['primary']).toBe('#e6e1e5');
    expect(r.dark['primary']).not.toBe(r.light['primary']);
    // ColorScheme.dark( named params land in the dark context too.
    expect(r.dark['secondary']).toBe('#d0bcff');
  });

  it('notes when no Color constants are found', () => {
    const r = parseDartTokens("void main() { print('hi'); }\n");
    expect(r.notes[0]).toMatch(/no Color\(0x/);
  });
});

describe('captureProjectTokens', () => {
  it('discovers a conventional CSS token source and merges dark over light', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-'));
    try {
      await fs.mkdir(path.join(root, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'src', 'index.css'),
        ':root {\n  --primary: 222 47% 11%;\n  --background: oklch(99% 0 0);\n}\n.dark {\n  --primary: 210 40% 96%;\n}\n',
      );
      const r = await captureProjectTokens(root);
      expect(r.stack).toBe('web');
      expect(r.files).toEqual(['src/index.css']);
      expect(r.tokens.light?.['primary']).toMatch(/^#/);
      // Dark = light overlaid with the .dark block (only --primary overridden).
      expect(r.tokens.dark?.['primary']).not.toBe(r.tokens.light?.['primary']);
      expect(r.tokens.dark?.['background']).toBe('oklch(99% 0 0)');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('captures the base system cleanly for multi-palette projects', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-palettes-'));
    try {
      await fs.mkdir(path.join(root, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'src', 'index.css'),
        [
          ':root {',
          '  --primary: 222 47% 11%;',
          '  --background: #ffffff;',
          '}',
          '.dark {',
          '  --primary: 210 40% 96%;',
          '}',
          "[data-palette='signal'] {",
          '  --primary: 346.8 77.2% 49.8%;',
          '}',
          "[data-palette='ocean'] {",
          '  --primary: 200 70% 45%;',
          '}',
          '',
        ].join('\n'),
      );
      const r = await captureProjectTokens(root);
      expect(r.files).toEqual(['src/index.css']);
      // Base capture is the :root/.dark system, never a variant's value.
      expect(r.tokens.light?.['background']).toBe('#ffffff');
      expect(r.tokens.light?.['primary']).not.toBe(r.palettes['signal']?.['primary']);
      expect(r.tokens.light?.['primary']).not.toBe(r.palettes['ocean']?.['primary']);
      // Both variants recorded separately, by name.
      expect(Object.keys(r.palettes).sort()).toEqual(['ocean', 'signal']);
      expect(r.notes.join(' ')).toMatch(/palette variants recorded separately/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('accepts explicit files at non-conventional paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-explicit-'));
    try {
      await fs.mkdir(path.join(root, 'tokens'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'tokens', 'theme.css'),
        ':root {\n  --primary: #123456;\n}\n',
      );
      const r = await captureProjectTokens(root, { files: ['tokens/theme.css'] });
      expect(r.files).toEqual(['tokens/theme.css']);
      expect(r.tokens.light?.['primary']).toBe('#123456');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reports honestly when no token source exists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-empty-'));
    try {
      const r = await captureProjectTokens(root);
      expect(r.files).toEqual([]);
      expect(r.tokens.light).toBeUndefined();
      expect(r.notes.join(' ')).toMatch(/no token source found/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('captured tokens store + resolveVerifyTokens precedence', () => {
  it('round-trips a capture and clears it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-store-'));
    try {
      await saveCapturedTokens(root, {
        stack: 'web',
        files: ['src/index.css'],
        tokens: { light: { primary: '#ff0000' }, dark: { primary: '#ff0000' } },
        palettes: { signal: { primary: '#fb2d5d' } },
        capturedAt: '2026-10-03T00:00:00.000Z',
      });
      const loaded = await loadCapturedTokens(root);
      expect(loaded?.files).toEqual(['src/index.css']);
      expect(loaded?.tokens.light?.['primary']).toBe('#ff0000');
      expect(loaded?.palettes?.['signal']?.['primary']).toBe('#fb2d5d');
      await clearCapturedTokens(root);
      expect(await loadCapturedTokens(root)).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('pinned kit wins over the capture; capture serves when unpinned; neither → undefined', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-cap-resolve-'));
    try {
      expect(await resolveVerifyTokens(root)).toBeUndefined();

      await saveCapturedTokens(root, {
        stack: 'web',
        files: ['src/index.css'],
        tokens: { light: { primary: '#ff0000' }, dark: { primary: '#ff0000' } },
      });
      const captured = await resolveVerifyTokens(root);
      expect(captured?.source).toBe('captured');
      expect(captured?.files).toEqual(['src/index.css']);

      await recordKitChoice(root, 'minimal-clarity', 'web', 'test', '2026-10-03T00:00:00.000Z');
      const pinned = await resolveVerifyTokens(root);
      expect(pinned?.source).toBe('kit');
      expect(pinned?.kit).toBe('minimal-clarity');

      // A pinned kit whose tokens cannot be read must NOT silently fall back
      // to the capture — verify reports against the wrong basis otherwise.
      await clearPersistedActiveKit(root);
      await recordKitChoice(root, 'no-such-kit', 'web', 'test', '2026-10-03T00:00:00.000Z');
      expect(await resolveVerifyTokens(root)).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
