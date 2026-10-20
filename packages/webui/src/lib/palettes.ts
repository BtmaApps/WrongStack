/**
 * Color palette registry — the WebUI's "main color" system.
 *
 * Users can pick a palette on top of the light/dark theme toggle. The actual
 * token values live in `index.css` as `:root[data-palette="…"]` /
 * `.dark[data-palette="…"]` blocks (rendering is driven by `hsl(var(--token))`),
 * so this module only describes the palettes for the picker UI: id, i18n
 * label, and the two swatch colors that preview the palette's two brand
 * signals. `applyPalette` toggles the `data-palette` attribute on `<html>`.
 *
 * To add a palette: add a CSS token block in `index.css`, an entry here, and
 * an i18n label key in all 7 locale files. The base "signal" palette needs no
 * CSS block — it is the token set on the bare `:root` / `.dark` selectors.
 * The base palette and the default one are different things: see below.
 */
export type PaletteId =
  | 'signal'
  | 'emerald-gold'
  | 'blue-navy'
  | 'purple-pink'
  | 'cyan-teal'
  | 'rose-copper'
  | 'indigo-amber'
  | 'sage-sand'
  | 'slate-violet'
  | 'coral-mint'
  | 'arctic-ember'
  | 'moss-rust'
  | 'terminal';

export interface PaletteDefinition {
  id: PaletteId;
  /** i18n key for the palette name, e.g. 'settings:general.paletteEmeraldGold'. */
  labelKey: string;
  /** CSS color for the main (primary) swatch stripe — dark-mode value so it reads on both themes. */
  swatch: string;
  /** CSS color for the secondary (brand) swatch stripe. */
  swatchSecondary: string;
}

/** The palette `index.css` defines on the bare selectors; applied by removing `data-palette`. */
export const BASE_PALETTE: PaletteId = 'signal';

/**
 * What a WebUI shows until its user picks a palette. Blue/Navy since #392: the
 * red-led base palette read as an error state, most of all in dark mode. A
 * user who picked Signal keeps it — only an explicit pick is persisted.
 */
export const DEFAULT_PALETTE: PaletteId = 'blue-navy';

/** localStorage key for the persisted palette — shared by ThemeProvider and the config store's merge. */
export const PALETTE_STORAGE_KEY = 'wrongstack-palette';

/** Picker order; the default comes first. */
export const PALETTES: readonly PaletteDefinition[] = [
  {
    id: 'blue-navy',
    labelKey: 'settings:general.paletteBlueNavy',
    swatch: 'hsl(213 90% 60%)',
    swatchSecondary: 'hsl(36 96% 54%)',
  },
  {
    id: 'signal',
    labelKey: 'settings:general.paletteSignal',
    swatch: 'hsl(345.9 99% 58.8%)',
    swatchSecondary: 'hsl(37.5 98.4% 50%)',
  },
  {
    id: 'emerald-gold',
    labelKey: 'settings:general.paletteEmeraldGold',
    swatch: 'hsl(152 66% 48%)',
    swatchSecondary: 'hsl(42 96% 54%)',
  },
  {
    id: 'purple-pink',
    labelKey: 'settings:general.palettePurplePink',
    swatch: 'hsl(263 82% 66%)',
    swatchSecondary: 'hsl(332 94% 62%)',
  },
  {
    id: 'cyan-teal',
    labelKey: 'settings:general.paletteCyanTeal',
    swatch: 'hsl(180 76% 46%)',
    swatchSecondary: 'hsl(36 96% 54%)',
  },
  {
    id: 'rose-copper',
    labelKey: 'settings:general.paletteRoseCopper',
    swatch: 'hsl(14 82% 56%)',
    swatchSecondary: 'hsl(34 96% 54%)',
  },
  {
    id: 'indigo-amber',
    labelKey: 'settings:general.paletteIndigoAmber',
    swatch: 'hsl(233 74% 58%)',
    swatchSecondary: 'hsl(38 96% 54%)',
  },
  {
    id: 'sage-sand',
    labelKey: 'settings:general.paletteSageSand',
    swatch: 'hsl(130 28% 55%)',
    swatchSecondary: 'hsl(36 55% 72%)',
  },
  {
    id: 'slate-violet',
    labelKey: 'settings:general.paletteSlateViolet',
    swatch: 'hsl(248 50% 55%)',
    swatchSecondary: 'hsl(285 52% 62%)',
  },
  {
    id: 'coral-mint',
    labelKey: 'settings:general.paletteCoralMint',
    swatch: 'hsl(12 85% 62%)',
    swatchSecondary: 'hsl(162 55% 55%)',
  },
  {
    id: 'arctic-ember',
    labelKey: 'settings:general.paletteArcticEmber',
    swatch: 'hsl(195 85% 58%)',
    swatchSecondary: 'hsl(14 85% 55%)',
  },
  {
    id: 'moss-rust',
    labelKey: 'settings:general.paletteMossRust',
    swatch: 'hsl(100 45% 38%)',
    swatchSecondary: 'hsl(18 70% 48%)',
  },
  {
    id: 'terminal',
    labelKey: 'settings:general.paletteTerminal',
    swatch: 'hsl(150 70% 45%)',
    swatchSecondary: 'hsl(40 90% 52%)',
  },
] as const satisfies readonly PaletteDefinition[];

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && PALETTES.some((palette) => palette.id === value);
}

export function getPalette(value: unknown): PaletteDefinition {
  return (
    PALETTES.find((palette) => palette.id === value) ??
    PALETTES.find((palette) => palette.id === DEFAULT_PALETTE) ??
    PALETTES[0]
  );
}

/** Guarded read of a persisted palette id; invalid/missing/blocked storage
 *  falls back to `fallback`. Shared by ThemeProvider (initial state) and the
 *  config store's `merge` so the two persistence layers agree. */
export function readStoredPalette(storageKey: string, fallback: PaletteId): PaletteId {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isPaletteId(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** Apply a palette to <html> by setting `data-palette`; removes it for the base palette. */
export function applyPalette(root: HTMLElement, palette: PaletteId): void {
  if (palette === BASE_PALETTE) {
    root.removeAttribute('data-palette');
  } else {
    root.setAttribute('data-palette', palette);
  }
}
