export type FontCategory = 'sans' | 'serif' | 'mono';

/** bundled = imported eagerly in main.tsx · lazy = loaded on first use · system = OS fonts only */
export type FontSource = 'bundled' | 'lazy' | 'system';

export interface FontFamilyBase {
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

export const FONT_FAMILY_LIST = [
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
