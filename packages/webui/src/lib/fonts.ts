/**
 * Font registry — the single source of every typeface and text size in the
 * WebUI.
 *
 * Six roles cover every text surface:
 *
 *   ui        `--font-sans`      buttons, menus, panels, lists, settings
 *   display   `--font-display`   page and section headings
 *   reading   `--font-reading`   chat replies, markdown, mailbox (follows ui)
 *   code      `--font-mono`      code blocks, logs, IDs, tabular readouts
 *   editor    `--font-editor`    Monaco editor + diff view        (follows code)
 *   terminal  `--font-terminal`  xterm sessions                   (follows code)
 *
 * A `FontSettings` value is a preset, optional per-role overrides, and the
 * size/spacing controls. `applyFontSettings` writes the resolved values onto
 * `<html>` as inline custom properties; `index.css` holds the base values and
 * the derived-role fallbacks, so a role left at its default writes nothing.
 * Monaco and xterm cannot read CSS variables — they take `editorFontOptions` /
 * `terminalFontOptions` directly. Interface text size reaches the ~3300 sized
 * class names through the build-time `font-scale-css` PostCSS plugin.
 *
 * Every non-system family is self-hosted through `@fontsource`. The four
 * default faces are imported eagerly in `main.tsx`; the rest load on demand
 * via `loadFontFamilies`, so an unused font costs nothing at runtime.
 *
 * To add a family: add an entry to `FONT_FAMILY_LIST` (with `package` and a
 * literal `load` import) and install the package. To add a preset: add an
 * entry to `FONT_PRESETS` and `settings:fonts.presets.<id>` keys in all 7
 * locale files.
 */

export type FontRole = 'ui' | 'display' | 'reading' | 'code' | 'editor' | 'terminal';
export type FontCategory = 'sans' | 'serif' | 'mono';
/** bundled = imported eagerly in main.tsx · lazy = loaded on first use · system = OS fonts only */
export type FontSource = 'bundled' | 'lazy' | 'system';

export const FONT_ROLES: readonly FontRole[] = [
  'ui',
  'display',
  'reading',
  'code',
  'editor',
  'terminal',
];

type DerivedRole = 'reading' | 'editor' | 'terminal';

/** Derived roles follow their parent until overridden (by a preset or the user). */
export const DERIVED_ROLE_PARENT: Readonly<Record<DerivedRole, FontRole>> = {
  reading: 'ui',
  editor: 'code',
  terminal: 'code',
};

export function isDerivedRole(role: FontRole): role is DerivedRole {
  return role in DERIVED_ROLE_PARENT;
}

export const ROLE_CATEGORIES: Readonly<Record<FontRole, readonly FontCategory[]>> = {
  ui: ['sans', 'serif', 'mono'],
  display: ['sans', 'serif', 'mono'],
  reading: ['sans', 'serif', 'mono'],
  code: ['mono'],
  editor: ['mono'],
  terminal: ['mono'],
};

export const FONT_ROLE_CSS_VARIABLE: Readonly<Record<FontRole, string>> = {
  ui: '--font-sans',
  display: '--font-display',
  reading: '--font-reading',
  code: '--font-mono',
  editor: '--font-editor',
  terminal: '--font-terminal',
};

interface FontFamilyBase {
  id: string;
  /** Proper font name — shown untranslated in the picker. */
  label: string;
  category: FontCategory;
  /** Full CSS `font-family` stack; the first entry is the self-hosted face. */
  stack: string;
  source: FontSource;
  /** npm package that ships the face (absent for system stacks). */
  package?: string;
  /** Lazy families only: literal import(s) so Vite can split each font. */
  load?: () => Promise<unknown>;
}

const FONT_FAMILY_LIST = [
  // ── Sans serif ──────────────────────────────────────────────────────────
  {
    id: 'manrope',
    label: 'Manrope',
    category: 'sans',
    source: 'bundled',
    package: '@fontsource-variable/manrope',
    stack: '"Manrope Variable", "Manrope", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    category: 'sans',
    source: 'bundled',
    package: '@fontsource-variable/space-grotesk',
    stack: '"Space Grotesk Variable", "Space Grotesk", "Manrope Variable", system-ui, sans-serif',
  },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    category: 'sans',
    source: 'bundled',
    package: '@fontsource-variable/ibm-plex-sans',
    stack: '"IBM Plex Sans Variable", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/inter',
    stack: '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/inter'),
  },
  {
    id: 'geist',
    label: 'Geist',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/geist',
    stack: '"Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/geist'),
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/dm-sans',
    stack: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/dm-sans'),
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/source-sans-3',
    stack: '"Source Sans 3 Variable", "Source Sans 3", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/source-sans-3'),
  },
  {
    id: 'nunito-sans',
    label: 'Nunito Sans',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/nunito-sans',
    stack: '"Nunito Sans Variable", "Nunito Sans", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/nunito-sans'),
  },
  {
    id: 'figtree',
    label: 'Figtree',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/figtree',
    stack: '"Figtree Variable", "Figtree", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/figtree'),
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/plus-jakarta-sans',
    stack:
      '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/plus-jakarta-sans'),
  },
  {
    id: 'outfit',
    label: 'Outfit',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/outfit',
    stack: '"Outfit Variable", "Outfit", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/outfit'),
  },
  {
    id: 'onest',
    label: 'Onest',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/onest',
    stack: '"Onest Variable", "Onest", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/onest'),
  },
  {
    id: 'lexend',
    label: 'Lexend',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/lexend',
    stack: '"Lexend Variable", "Lexend", ui-sans-serif, system-ui, sans-serif',
    load: () => import('@fontsource-variable/lexend'),
  },
  {
    id: 'atkinson-next',
    label: 'Atkinson Hyperlegible Next',
    category: 'sans',
    source: 'lazy',
    package: '@fontsource-variable/atkinson-hyperlegible-next',
    stack:
      '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", Verdana, system-ui, sans-serif',
    load: () => import('@fontsource-variable/atkinson-hyperlegible-next'),
  },
  {
    id: 'system-sans',
    label: 'System UI',
    category: 'sans',
    source: 'system',
    stack:
      'system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  // ── Serif ───────────────────────────────────────────────────────────────
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    category: 'serif',
    source: 'lazy',
    package: '@fontsource-variable/source-serif-4',
    stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, "Times New Roman", serif',
    load: () => import('@fontsource-variable/source-serif-4'),
  },
  {
    id: 'literata',
    label: 'Literata',
    category: 'serif',
    source: 'lazy',
    package: '@fontsource-variable/literata',
    stack: '"Literata Variable", "Literata", Georgia, "Times New Roman", serif',
    load: () => import('@fontsource-variable/literata'),
  },
  {
    id: 'plex-serif',
    label: 'IBM Plex Serif',
    category: 'serif',
    source: 'lazy',
    package: '@fontsource/ibm-plex-serif',
    stack: '"IBM Plex Serif", Georgia, "Times New Roman", serif',
    load: () =>
      Promise.all([
        import('@fontsource/ibm-plex-serif/400.css'),
        import('@fontsource/ibm-plex-serif/600.css'),
        import('@fontsource/ibm-plex-serif/700.css'),
      ]),
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    category: 'serif',
    source: 'lazy',
    package: '@fontsource-variable/fraunces',
    stack: '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
    load: () => import('@fontsource-variable/fraunces'),
  },
  {
    id: 'system-serif',
    label: 'Charter / Georgia',
    category: 'serif',
    source: 'system',
    stack: '"Iowan Old Style", Charter, "Source Serif 4", Georgia, "Times New Roman", serif',
  },
  // ── Monospace ───────────────────────────────────────────────────────────
  {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    category: 'mono',
    source: 'bundled',
    package: '@fontsource/ibm-plex-mono',
    stack: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/jetbrains-mono',
    stack: '"JetBrains Mono Variable", "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/jetbrains-mono'),
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/fira-code',
    stack: '"Fira Code Variable", "Fira Code", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/fira-code'),
  },
  {
    id: 'cascadia-code',
    label: 'Cascadia Code',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/cascadia-code',
    stack: '"Cascadia Code Variable", "Cascadia Code", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/cascadia-code'),
  },
  {
    id: 'geist-mono',
    label: 'Geist Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/geist-mono',
    stack: '"Geist Mono Variable", "Geist Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/geist-mono'),
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/source-code-pro',
    stack:
      '"Source Code Pro Variable", "Source Code Pro", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/source-code-pro'),
  },
  {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/roboto-mono',
    stack: '"Roboto Mono Variable", "Roboto Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/roboto-mono'),
  },
  {
    id: 'victor-mono',
    label: 'Victor Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/victor-mono',
    stack: '"Victor Mono Variable", "Victor Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/victor-mono'),
  },
  {
    id: 'commit-mono',
    label: 'Commit Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource/commit-mono',
    stack: '"Commit Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () =>
      Promise.all([
        import('@fontsource/commit-mono/400.css'),
        import('@fontsource/commit-mono/600.css'),
        import('@fontsource/commit-mono/700.css'),
      ]),
  },
  {
    id: 'red-hat-mono',
    label: 'Red Hat Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/red-hat-mono',
    stack: '"Red Hat Mono Variable", "Red Hat Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/red-hat-mono'),
  },
  {
    id: 'intel-one-mono',
    label: 'Intel One Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource/intel-one-mono',
    stack: '"Intel One Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () =>
      Promise.all([
        import('@fontsource/intel-one-mono/400.css'),
        import('@fontsource/intel-one-mono/600.css'),
        import('@fontsource/intel-one-mono/700.css'),
      ]),
  },
  {
    id: 'martian-mono',
    label: 'Martian Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/martian-mono',
    stack: '"Martian Mono Variable", "Martian Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/martian-mono'),
  },
  {
    id: 'noto-sans-mono',
    label: 'Noto Sans Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource-variable/noto-sans-mono',
    stack: '"Noto Sans Mono Variable", "Noto Sans Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () => import('@fontsource-variable/noto-sans-mono'),
  },
  {
    id: 'iosevka',
    label: 'Iosevka',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource/iosevka',
    stack: '"Iosevka", "IBM Plex Mono", ui-monospace, monospace',
    // Iosevka's per-weight subsets are large; the regular weight covers code.
    load: () => import('@fontsource/iosevka/400.css'),
  },
  {
    id: 'ubuntu-mono',
    label: 'Ubuntu Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource/ubuntu-mono',
    stack: '"Ubuntu Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () =>
      Promise.all([
        import('@fontsource/ubuntu-mono/400.css'),
        import('@fontsource/ubuntu-mono/700.css'),
      ]),
  },
  {
    id: 'space-mono',
    label: 'Space Mono',
    category: 'mono',
    source: 'lazy',
    package: '@fontsource/space-mono',
    stack: '"Space Mono", "IBM Plex Mono", ui-monospace, monospace',
    load: () =>
      Promise.all([
        import('@fontsource/space-mono/400.css'),
        import('@fontsource/space-mono/700.css'),
      ]),
  },
  {
    id: 'system-mono',
    label: 'System Mono',
    category: 'mono',
    source: 'system',
    stack:
      'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, Menlo, "Liberation Mono", monospace',
  },
] as const satisfies readonly FontFamilyBase[];

export type FontFamilyId = (typeof FONT_FAMILY_LIST)[number]['id'];

export interface FontFamilyDefinition extends FontFamilyBase {
  id: FontFamilyId;
}

export const FONT_FAMILIES: readonly FontFamilyDefinition[] = FONT_FAMILY_LIST;

export type FontPresetId =
  | 'workbench'
  | 'plex'
  | 'modern'
  | 'geist'
  | 'classic'
  | 'editorial'
  | 'readable'
  | 'friendly'
  | 'monospace'
  | 'system';

export interface FontPresetDefinition {
  id: FontPresetId;
  labelKey: string;
  descriptionKey: string;
  /** Base roles are required; derived roles follow their parent unless set. */
  families: Readonly<
    Record<'ui' | 'display' | 'code', FontFamilyId> & Partial<Record<DerivedRole, FontFamilyId>>
  >;
}

const preset = (
  id: FontPresetId,
  families: FontPresetDefinition['families'],
): FontPresetDefinition => ({
  id,
  labelKey: `settings:fonts.presets.${id}.label`,
  descriptionKey: `settings:fonts.presets.${id}.description`,
  families,
});

export const FONT_PRESETS: readonly FontPresetDefinition[] = [
  preset('workbench', { ui: 'manrope', display: 'space-grotesk', code: 'plex-mono' }),
  preset('plex', { ui: 'plex-sans', display: 'plex-sans', code: 'plex-mono' }),
  preset('modern', { ui: 'inter', display: 'inter', code: 'jetbrains-mono' }),
  preset('geist', { ui: 'geist', display: 'geist', code: 'geist-mono' }),
  preset('classic', { ui: 'source-sans-3', display: 'source-serif-4', code: 'source-code-pro' }),
  preset('editorial', {
    ui: 'dm-sans',
    display: 'fraunces',
    reading: 'literata',
    code: 'commit-mono',
  }),
  preset('readable', {
    ui: 'atkinson-next',
    display: 'lexend',
    code: 'intel-one-mono',
  }),
  preset('friendly', { ui: 'nunito-sans', display: 'outfit', code: 'fira-code' }),
  preset('monospace', {
    ui: 'jetbrains-mono',
    display: 'space-mono',
    code: 'jetbrains-mono',
  }),
  preset('system', { ui: 'system-sans', display: 'system-sans', code: 'system-mono' }),
];

export const DEFAULT_FONT_PRESET: FontPresetId = 'workbench';

// ── Size & spacing ──────────────────────────────────────────────────────────

export const FONT_SIZE_LIMITS = {
  /** Multiplier for every absolute text size in the interface. */
  uiScale: { min: 0.8, max: 1.4, step: 0.05 },
  editorFontSize: { min: 10, max: 24, step: 1 },
  terminalFontSize: { min: 10, max: 24, step: 1 },
  /** Multiplier of the code font size (editor, diff view, code blocks). */
  codeLineHeight: { min: 1.2, max: 2, step: 0.05 },
  /** xterm row-height multiplier. */
  terminalLineHeight: { min: 1, max: 1.6, step: 0.05 },
} as const;

export type FontNumericSetting = keyof typeof FONT_SIZE_LIMITS;

export interface FontSettings {
  preset: FontPresetId;
  /** Per-role family overrides. Only real deviations from the fallback are kept. */
  overrides: Partial<Record<FontRole, FontFamilyId>>;
  uiScale: number;
  editorFontSize: number;
  terminalFontSize: number;
  codeLineHeight: number;
  terminalLineHeight: number;
  /** Programming ligatures in code blocks and the editor (not xterm). */
  ligatures: boolean;
}

export type SizePresetId = 'compact' | 'normal' | 'comfortable' | 'large';

export interface SizePresetDefinition {
  id: SizePresetId;
  labelKey: string;
  values: Readonly<Pick<FontSettings, FontNumericSetting>>;
}

export const SIZE_PRESETS: readonly SizePresetDefinition[] = [
  {
    id: 'compact',
    labelKey: 'settings:fonts.sizePresets.compact',
    values: {
      uiScale: 0.9,
      editorFontSize: 12,
      terminalFontSize: 12,
      codeLineHeight: 1.4,
      terminalLineHeight: 1,
    },
  },
  {
    id: 'normal',
    labelKey: 'settings:fonts.sizePresets.normal',
    values: {
      uiScale: 1,
      editorFontSize: 13,
      terminalFontSize: 13,
      codeLineHeight: 1.5,
      terminalLineHeight: 1,
    },
  },
  {
    id: 'comfortable',
    labelKey: 'settings:fonts.sizePresets.comfortable',
    values: {
      uiScale: 1.1,
      editorFontSize: 14,
      terminalFontSize: 14,
      codeLineHeight: 1.6,
      terminalLineHeight: 1.1,
    },
  },
  {
    id: 'large',
    labelKey: 'settings:fonts.sizePresets.large',
    values: {
      uiScale: 1.25,
      editorFontSize: 16,
      terminalFontSize: 16,
      codeLineHeight: 1.7,
      terminalLineHeight: 1.15,
    },
  },
];

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  preset: DEFAULT_FONT_PRESET,
  overrides: {},
  ...SIZE_PRESETS[1].values,
  ligatures: false,
};

const NUMERIC_SETTINGS = Object.keys(FONT_SIZE_LIMITS) as FontNumericSetting[];

// ── Lookup & validation ─────────────────────────────────────────────────────

export function isFontRole(value: unknown): value is FontRole {
  return typeof value === 'string' && (FONT_ROLES as readonly string[]).includes(value);
}

export function isFontPresetId(value: unknown): value is FontPresetId {
  return typeof value === 'string' && FONT_PRESETS.some((entry) => entry.id === value);
}

export function isFontFamilyId(value: unknown): value is FontFamilyId {
  return typeof value === 'string' && FONT_FAMILIES.some((family) => family.id === value);
}

export function getFontPreset(value: unknown): FontPresetDefinition {
  return FONT_PRESETS.find((entry) => entry.id === value) ?? FONT_PRESETS[0];
}

export function getFontFamily(id: FontFamilyId): FontFamilyDefinition {
  // Ids are a closed union validated at every entry point, so the lookup
  // always hits; the fallback only guards against a registry edit gone wrong.
  return FONT_FAMILIES.find((family) => family.id === id) ?? FONT_FAMILIES[0];
}

export function fontFamiliesForRole(role: FontRole): FontFamilyDefinition[] {
  return FONT_FAMILIES.filter((family) => ROLE_CATEGORIES[role].includes(family.category));
}

export function isFamilyAllowedForRole(role: FontRole, id: FontFamilyId): boolean {
  return ROLE_CATEGORIES[role].includes(getFontFamily(id).category);
}

export function clampFontSetting(key: FontNumericSetting, value: unknown): number {
  const limits = FONT_SIZE_LIMITS[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FONT_SETTINGS[key];
  const stepped = Math.round(value / limits.step) * limits.step;
  return Number(Math.min(limits.max, Math.max(limits.min, stepped)).toFixed(2));
}

/** Roles/families from the first (3-role) version of the picker. */
const LEGACY_ROLE: Readonly<Record<string, FontRole>> = { sans: 'ui', mono: 'code' };
const LEGACY_FAMILY: Readonly<Record<string, FontFamilyId>> = {
  humanist: 'atkinson-next',
  serif: 'system-serif',
};

function resolveRoles(
  presetId: FontPresetId,
  overrides: Partial<Record<FontRole, FontFamilyId>>,
): Record<FontRole, FontFamilyId> {
  const families = getFontPreset(presetId).families;
  const resolved = {} as Record<FontRole, FontFamilyId>;
  // FONT_ROLES lists every parent before its derived roles.
  for (const role of FONT_ROLES) {
    const fromPreset: FontFamilyId | undefined = families[role];
    const inherited = isDerivedRole(role) ? resolved[DERIVED_ROLE_PARENT[role]] : undefined;
    resolved[role] = overrides[role] ?? fromPreset ?? inherited ?? families.ui;
  }
  return resolved;
}

/** Coerce an untrusted (persisted/legacy) value into valid settings. */
export function normalizeFontSettings(value: unknown): FontSettings {
  if (!value || typeof value !== 'object') return DEFAULT_FONT_SETTINGS;
  const raw = value as Record<string, unknown>;
  const presetId = isFontPresetId(raw.preset) ? raw.preset : DEFAULT_FONT_PRESET;

  const candidates: Partial<Record<FontRole, FontFamilyId>> = {};
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [key, id] of Object.entries(raw.overrides as Record<string, unknown>)) {
      const role = LEGACY_ROLE[key] ?? key;
      const familyId = typeof id === 'string' ? (LEGACY_FAMILY[id] ?? id) : id;
      if (!isFontRole(role) || !isFontFamilyId(familyId)) continue;
      if (!isFamilyAllowedForRole(role, familyId)) continue;
      candidates[role] = familyId;
    }
  }

  // Keep only overrides that change the outcome, resolving parents first so a
  // derived override equal to its (possibly overridden) parent is dropped.
  const overrides: Partial<Record<FontRole, FontFamilyId>> = {};
  for (const role of FONT_ROLES) {
    const candidate = candidates[role];
    if (!candidate) continue;
    if (resolveRoles(presetId, overrides)[role] !== candidate) overrides[role] = candidate;
  }

  const settings: FontSettings = {
    ...DEFAULT_FONT_SETTINGS,
    preset: presetId,
    overrides,
    ligatures: typeof raw.ligatures === 'boolean' ? raw.ligatures : DEFAULT_FONT_SETTINGS.ligatures,
  };
  for (const key of NUMERIC_SETTINGS) settings[key] = clampFontSetting(key, raw[key]);
  return settings;
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** Tolerates missing settings (a store mocked without `fonts`) by resolving
 *  to the defaults. */
export function resolveFontFamilies(
  settings: FontSettings | undefined,
): Record<FontRole, FontFamilyId> {
  return resolveRoles(settings?.preset ?? DEFAULT_FONT_PRESET, settings?.overrides ?? {});
}

/** The family a role shows when its override is cleared. */
export function fallbackFontFamily(settings: FontSettings, role: FontRole): FontFamilyId {
  const { [role]: _cleared, ...rest } = settings.overrides;
  return resolveRoles(settings.preset, rest)[role];
}

export function resolveFontStacks(settings: FontSettings | undefined): Record<FontRole, string> {
  const families = resolveFontFamilies(settings);
  const stacks = {} as Record<FontRole, string>;
  for (const role of FONT_ROLES) stacks[role] = getFontFamily(families[role]).stack;
  return stacks;
}

export function matchSizePreset(settings: FontSettings): SizePresetId | null {
  const match = SIZE_PRESETS.find((entry) =>
    NUMERIC_SETTINGS.every((key) => entry.values[key] === settings[key]),
  );
  return match?.id ?? null;
}

export interface EditorFontOptions {
  fontFamily: string;
  fontSize: number;
  /** Absolute pixels — Monaco treats small values as multipliers. */
  lineHeight: number;
  fontLigatures: boolean;
}

export function editorFontOptions(settings: FontSettings | undefined): EditorFontOptions {
  const resolved = settings ?? DEFAULT_FONT_SETTINGS;
  return {
    fontFamily: resolveFontStacks(resolved).editor,
    fontSize: resolved.editorFontSize,
    lineHeight: Math.round(resolved.editorFontSize * resolved.codeLineHeight),
    fontLigatures: resolved.ligatures,
  };
}

export interface TerminalFontOptions {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export function terminalFontOptions(settings: FontSettings | undefined): TerminalFontOptions {
  const resolved = settings ?? DEFAULT_FONT_SETTINGS;
  return {
    fontFamily: resolveFontStacks(resolved).terminal,
    fontSize: resolved.terminalFontSize,
    lineHeight: resolved.terminalLineHeight,
  };
}

/** Inline-style font size that follows the interface text scale — for the
 *  few components that size text from JS (graphs, inline-styled panels). */
export function scaledPx(px: number): string {
  return `calc(${px}px * var(--ui-font-scale, 1))`;
}

export const CODE_LIGATURE_FEATURES_ON = '"liga" 1, "calt" 1';
export const CODE_LIGATURE_FEATURES_OFF = '"liga" 0, "calt" 0';

// ── DOM application ─────────────────────────────────────────────────────────

function setOrClear(root: HTMLElement, name: string, value: string | null): void {
  if (value === null) root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/** Write settings onto <html>. Values equal to their `index.css` fallback are
 *  removed, so the stylesheet stays the single source of the defaults. */
export function applyFontSettings(root: HTMLElement, settings: FontSettings): void {
  const families = resolveFontFamilies(settings);
  const defaults = resolveFontFamilies(DEFAULT_FONT_SETTINGS);
  for (const role of FONT_ROLES) {
    const baseline = isDerivedRole(role) ? families[DERIVED_ROLE_PARENT[role]] : defaults[role];
    setOrClear(
      root,
      FONT_ROLE_CSS_VARIABLE[role],
      families[role] === baseline ? null : getFontFamily(families[role]).stack,
    );
  }
  setOrClear(
    root,
    '--ui-font-scale',
    settings.uiScale === DEFAULT_FONT_SETTINGS.uiScale ? null : String(settings.uiScale),
  );
  setOrClear(
    root,
    '--code-line-height',
    settings.codeLineHeight === DEFAULT_FONT_SETTINGS.codeLineHeight
      ? null
      : String(settings.codeLineHeight),
  );
  setOrClear(root, '--code-font-features', settings.ligatures ? CODE_LIGATURE_FEATURES_ON : null);
}

// ── On-demand loading ───────────────────────────────────────────────────────

const loadPromises = new Map<FontFamilyId, Promise<void>>();
const loadListeners = new Set<() => void>();
let loadVersion = 0;

async function waitForFace(family: FontFamilyDefinition): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const primary = family.stack.split(',')[0]?.trim();
  if (!primary) return;
  await Promise.all([
    document.fonts.load(`400 16px ${primary}`),
    document.fonts.load(`700 16px ${primary}`),
  ]);
}

/** Load (once) and wait for the given families. Resolves even when a font
 *  fails — the stack's fallbacks keep rendering. Listeners fire after each
 *  newly finished family so canvas-measured widgets (Monaco, xterm) re-measure. */
export function loadFontFamilies(ids: Iterable<FontFamilyId>): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const id of new Set(ids)) {
    const family = getFontFamily(id);
    if (family.source === 'system') continue;
    let promise = loadPromises.get(id);
    if (!promise) {
      promise = Promise.resolve()
        .then(() => family.load?.())
        .then(() => waitForFace(family))
        .catch(() => {
          // Offline, blocked, or unsupported: the stack fallbacks still render.
        })
        .then(() => {
          loadVersion += 1;
          for (const listener of loadListeners) {
            try {
              listener();
            } catch {
              // One widget failing to re-measure must not starve the others
              // or turn the load chain into an unhandled rejection.
            }
          }
        });
      loadPromises.set(id, promise);
    }
    pending.push(promise);
  }
  return Promise.all(pending).then(() => undefined);
}

export function subscribeFontLoads(listener: () => void): () => void {
  loadListeners.add(listener);
  return () => {
    loadListeners.delete(listener);
  };
}

export function getFontLoadVersion(): number {
  return loadVersion;
}
