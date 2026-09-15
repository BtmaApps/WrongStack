import { describe, expect, it } from 'vitest';
import {
  glyphSet,
  glyphs,
  hasInstalledNerdFont,
  type IconStyle,
  resolveIconStyle,
} from '../src/ui-glyphs.js';

const noNerdFont = () => false;

describe('resolveIconStyle', () => {
  it('returns "unicode" when env is not set', () => {
    expect(resolveIconStyle({}, noNerdFont)).toBe('unicode');
  });

  it('returns "unicode" when env is undefined', () => {
    expect(resolveIconStyle(undefined as unknown as NodeJS.ProcessEnv, noNerdFont)).toBe('unicode');
  });

  it('returns "unicode" for unrecognised values', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'whatever' }, () => true)).toBe('unicode');
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: '' }, noNerdFont)).toBe('unicode');
  });

  it('returns "nerd" for "nerd"', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'nerd' })).toBe('nerd');
  });

  it('returns "nerd" for "nerd-font"', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'nerd-font' })).toBe('nerd');
  });

  it('returns "nerd" for "nerdfont"', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'nerdfont' })).toBe('nerd');
  });

  it('returns "nerd" for "NERD" (case insensitive)', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'NERD' })).toBe('nerd');
  });

  it('returns "ascii" for "ascii"', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'ascii' })).toBe('ascii');
  });

  it('returns "ascii" for "plain"', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'plain' })).toBe('ascii');
  });

  it('trims whitespace from env value', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: '  nerd  ' })).toBe('nerd');
  });

  it('auto-selects nerd glyphs when a local Nerd Font is installed', () => {
    expect(resolveIconStyle({}, () => true)).toBe('nerd');
  });

  it('lets an explicit unicode setting override installed Nerd Fonts', () => {
    expect(resolveIconStyle({ WRONGSTACK_TUI_ICON_STYLE: 'unicode' }, () => true)).toBe('unicode');
  });

  it('reads from process.env by default', () => {
    // This test checks the default parameter behavior
    const result = resolveIconStyle();
    expect(['unicode', 'nerd', 'ascii']).toContain(result);
  });
});

describe('hasInstalledNerdFont', () => {
  it('detects Nerd Font files recursively in local font directories', () => {
    const files = new Map<string, Array<{ name: string; isDirectory: boolean }>>([
      ['/home/me/.local/share/fonts', [{ name: 'JetBrainsMono', isDirectory: true }]],
      [
        '/home/me/.local/share/fonts/JetBrainsMono',
        [{ name: 'JetBrainsMonoNerdFontMono-Regular.ttf', isDirectory: false }],
      ],
    ]);
    expect(
      hasInstalledNerdFont({
        platform: 'linux',
        homeDir: '/home/me',
        env: {},
        readDirectory: (directory) => {
          const entries = files.get(directory);
          if (!entries) throw new Error('missing');
          return entries;
        },
      }),
    ).toBe(true);
  });

  it('does not infer the SSH client font from server-side font files', () => {
    expect(
      hasInstalledNerdFont({
        platform: 'linux',
        homeDir: '/home/me',
        env: { SSH_CONNECTION: 'client 1 server 2' },
        readDirectory: () => [{ name: 'SymbolsNerdFont-Regular.ttf', isDirectory: false }],
      }),
    ).toBe(false);
  });

  it('ignores unrelated font files', () => {
    expect(
      hasInstalledNerdFont({
        platform: 'darwin',
        homeDir: '/Users/me',
        env: {},
        readDirectory: (directory) => {
          if (directory === '/Users/me/Library/Fonts') {
            return [{ name: 'Inter-Regular.ttf', isDirectory: false }];
          }
          throw new Error('missing');
        },
      }),
    ).toBe(false);
  });
});

describe('glyphSet', () => {
  it('returns UNICODE glyphs by default', () => {
    const g = glyphSet();
    expect(g.brand).toBe('◆');
    expect(g.prompt).toBe('❯');
    expect(g.success).toBe('✓');
    expect(g.failure).toBe('×');
  });

  it('returns UNICODE glyphs for "unicode" style', () => {
    const g = glyphSet('unicode');
    expect(g.segmentStart).toBe('◖');
    expect(g.segmentTransition).toBe('▶');
    expect(g.segmentEnd).toBe('◗');
  });

  it('returns NERD glyphs for "nerd" style', () => {
    const g = glyphSet('nerd');
    expect(g.brand).toBe('󰚩');
    expect(g.gitBranch).toBe('');
    expect(g.fleet).toBe('󰓾');
    expect(g.segmentStart).toBe('');
    expect(g.segmentTransition).toBe('');
    expect(g.segmentEnd).toBe('');
  });

  it('returns ASCII glyphs for "ascii" style', () => {
    const g = glyphSet('ascii');
    expect(g.brand).toBe('*');
    expect(g.prompt).toBe('>');
    expect(g.success).toBe('+');
    expect(g.failure).toBe('x');
    expect(g.idle).toBe('o');
    expect(g.running).toBe('>');
    expect(g.gitBranch).toBe('git');
    expect(g.segmentStart).toBe('[');
    expect(g.segmentTransition).toBe('>');
    expect(g.segmentEnd).toBe(']');
  });

  it('returns UNICODE for unrecognised style', () => {
    const g = glyphSet('bogus' as IconStyle);
    expect(g.prompt).toBe('❯');
  });

  it('NERD glyphs include all the same fields as UNICODE', () => {
    const unicode = glyphSet('unicode');
    const nerd = glyphSet('nerd');
    expect(Object.keys(nerd).sort()).toEqual(Object.keys(unicode).sort());
  });

  it('ASCII glyphs include all the same fields as UNICODE', () => {
    const unicode = glyphSet('unicode');
    const ascii = glyphSet('ascii');
    expect(Object.keys(ascii).sort()).toEqual(Object.keys(unicode).sort());
  });

  it('NERD overrides specific UNICODE fields', () => {
    const unicode = glyphSet('unicode');
    const nerd = glyphSet('nerd');
    // Nerd should differ for brand, gitBranch, etc.
    expect(nerd.brand).not.toBe(unicode.brand);
    // But prompt should be the same
    expect(nerd.prompt).toBe(unicode.prompt);
  });
});

describe('glyphs singleton', () => {
  it('is exported as a frozen object resolved from the process env', () => {
    expect(Object.isFrozen(glyphs)).toBe(true);
    expect(glyphs).toBe(glyphSet(resolveIconStyle()));
  });
});
