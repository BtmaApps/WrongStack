/**
 * Design DNA — node-side summary of what `DESIGN_DNA_EXTRACTOR` measured.
 *
 * The extractor returns counts and pixels per viewport; this module turns
 * them into decisions a model can apply without having to "see" the page:
 * color roles, the type scale and its ratio, the spacing unit, radius and
 * elevation style, motion timing, section rhythm and layout signals.
 *
 * Every function here is pure so the inference is testable and identical for
 * every model. Inferred values (roles, ratio, unit, signals) are kept apart
 * from the measured ones and each inference states the evidence it used —
 * `notes` records what the measurement could not see.
 */

import { deltaE, hexChroma, hexContrast, hexToOklab, type OkLab } from './design-dna-color.js';

export * from './design-dna-color.js';

/** `[key, weight]` pairs, heaviest first — the extractor's map encoding. */
export type DnaCounts = Array<[string, number]>;

export interface DnaButton {
  h: number;
  w: number;
  padX: number;
  r: number | 'full';
  bg: string | null;
  fg: string | null;
  border: string | null;
  fw: string;
  fs: number;
  tt: string;
  y: number;
}

export interface DnaSection {
  tag: string;
  y: number;
  h: number;
  bg: string | null;
  padY: [number, number];
  cols: number;
  media: 'left' | 'right' | 'center' | 'full' | null;
  container: number;
  align: string | null;
  sticky: boolean;
}

/** One viewport's raw measurement, exactly as the in-page script returns it. */
export interface DesignDnaRaw {
  v: 1;
  url: string;
  title: string;
  vw: number;
  vh: number;
  docH: number;
  screens: number;
  rootBg: string | null;
  colorScheme: string;
  themeColor: string | null;
  generator: string | null;
  samples: { points: number; media: number; gradient: number; area: DnaCounts };
  text: DnaCounts;
  textColor: DnaCounts;
  families: DnaCounts;
  fontsLoaded: string[];
  padding: DnaCounts;
  gap: DnaCounts;
  vmargin: DnaCounts;
  radius: DnaCounts;
  shadow: DnaCounts;
  borderW: DnaCounts;
  borderColor: DnaCounts;
  duration: DnaCounts;
  easing: DnaCounts;
  gradients: DnaCounts;
  effects: Record<string, number>;
  /** `[columns, columnGap, children, width, top]`. */
  grids: number[][];
  buttons: DnaButton[];
  inputs: Array<{
    h: number;
    r: number;
    bg: string | null;
    border: string | null;
    bw: number;
    fs: number;
  }>;
  nav: {
    h: number;
    pos: string;
    bg: string | null;
    backdrop: boolean;
    links: number;
    buttons: number;
  } | null;
  sections: DnaSection[];
  images: number;
  imgRatios: DnaCounts;
  icons: DnaCounts;
  vars: Record<string, string>;
  elements: number;
  /** Characters inside footer/contentinfo, excluded from `text`/`textColor`. */
  footerChars?: number | undefined;
}

export interface DnaColorRoles {
  bg?: string | undefined;
  surface?: string | undefined;
  fg?: string | undefined;
  muted?: string | undefined;
  primary?: string | undefined;
  accent?: string | undefined;
  border?: string | undefined;
}

export interface DnaLayout {
  width: number;
  /** Most common centered content width (border box), 0 when none was centered. */
  container: number;
  sections: Array<Pick<DnaSection, 'y' | 'h' | 'cols' | 'media' | 'align' | 'bg'>>;
  /** Widest multi-column grid per viewport — reflow evidence. */
  maxGridCols: number;
  nav: DesignDnaRaw['nav'];
  docHeight: number;
}

/** The summarized, model-facing design DNA of one page. */
export interface DesignDna {
  version: 1;
  source: { url: string; title: string; capturedAt: string; viewports: number[] };
  theme: 'light' | 'dark';
  color: {
    roles: DnaColorRoles;
    /** Visible-area palette of the widest viewport: share of sampled points. */
    area: Array<{ hex: string; share: number }>;
    text: Array<{ hex: string; share: number }>;
    mediaShare: number;
    gradientShare: number;
    /** Share of visible area whose color is chromatic (OKLCH C ≥ 0.06). */
    chromaticShare: number;
  };
  type: {
    text?: string | undefined;
    display?: string | undefined;
    mono?: string | undefined;
    loaded: string[];
    base: { size: number; weight: number; lineHeight: number } | null;
    /** Sizes carrying real text, ascending (px). */
    scale: number[];
    /** Geometric mean step between sizes above the base; null with < 2 steps. */
    ratio: number | null;
    headingWeight: number | null;
    /** Letter-spacing of the largest sizes in em (negative = tightened display). */
    displayTracking: number | null;
    uppercaseShare: number;
  };
  space: {
    unit: number | null;
    /** Weighted share of spacing values that are multiples of `unit`. */
    unitFit: number;
    scale: number[];
    sectionPadY: number | null;
  };
  shape: {
    radius: number | 'full' | null;
    radiusScale: number[];
    pillShare: number;
    shadowStyle: 'none' | 'soft' | 'hard' | 'ring' | 'mixed';
    shadowSamples: string[];
    borderWidth: number | null;
  };
  motion: { duration: number | null; durations: number[]; easing: string | null; animated: number };
  components: {
    button: {
      h: number;
      padX: number;
      radius: number | 'full';
      weight: number;
      size: number;
      transform: string;
    } | null;
    input: { h: number; radius: number; borderWidth: number } | null;
  };
  layout: DnaLayout[];
  effects: Record<string, number>;
  declaredTokens: Record<string, string>;
  signals: string[];
  notes: string[];
}

// ── small helpers ────────────────────────────────────────────────────────────

const solid = (key: string): string => key.split('/')[0] ?? key;
const isOpaque = (key: string | null): key is string => !!key && !key.includes('/');

function total(counts: DnaCounts): number {
  return counts.reduce((sum, [, n]) => sum + n, 0);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function mode<T>(values: T[]): T | undefined {
  const seen = new Map<T, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [v, c] of seen) if (c > n) [best, n] = [v, c];
  return best;
}

/** Round to `step` without float residue (1.4000000000000001). */
const round = (n: number, step = 0.01): number =>
  Number((Math.round(n / step) * step).toFixed(Math.max(0, -Math.floor(Math.log10(step)))));
const MONO_RE = /mono|code|courier|consol|menlo|monaco/i;
const GENERIC_FONT =
  /^(serif|sans-serif|monospace|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|cursive|fantasy)$/i;

interface TextRun {
  size: number;
  weight: number;
  lineHeight: number;
  tracking: number;
  family: string;
  transform: string;
  tag: string;
  chars: number;
}

function parseText(raw: DesignDnaRaw): TextRun[] {
  return raw.text.map(([key, chars]) => {
    const [size, weight, lh, ls, family, transform, tag] = key.split('|');
    return {
      size: Number(size),
      weight: Number(weight),
      lineHeight: Number(lh),
      tracking: Number(ls),
      family: family ?? '',
      transform: transform ?? '',
      tag: tag ?? '',
      chars,
    };
  });
}

// ── inference ────────────────────────────────────────────────────────────────

function inferColor(
  raw: DesignDnaRaw,
  buttons: DnaButton[],
): DesignDna['color'] & { theme: DesignDna['theme'] } {
  const points = Math.max(1, raw.samples.points);
  const area = raw.samples.area.map(([hex, n]) => ({ hex, share: round(n / points, 0.001) }));
  const textTotal = Math.max(1, total(raw.textColor));
  const text = raw.textColor.map(([hex, n]) => ({ hex, share: round(n / textTotal, 0.001) }));
  const roles: DnaColorRoles = {};

  // The page's own background wins while it still covers a fair share: a
  // half-page inverted band must not flip the whole theme (and with it fg).
  const rootShare = area.find((c) => c.hex === raw.rootBg)?.share ?? 0;
  roles.bg = isOpaque(raw.rootBg) && rootShare >= 0.2 ? raw.rootBg : (area[0]?.hex ?? undefined);
  const bg = roles.bg ?? '#ffffff';
  const theme: DesignDna['theme'] = (hexToOklab(bg)?.L ?? 1) < 0.5 ? 'dark' : 'light';
  roles.surface = area.find(
    (c) => c.hex !== bg && c.share >= 0.02 && deltaE(c.hex, bg) < 0.12,
  )?.hex;

  const readable = text
    .map((t) => ({ ...t, hex: solid(t.hex), contrast: hexContrast(solid(t.hex), bg) }))
    .filter((t) => t.contrast >= 2.2);
  // Body text and secondary text often carry near-equal character counts;
  // among the heavily used readable colors the strongest contrast is the fg.
  const strong = readable.filter((t) => t.contrast >= 4.5);
  const heaviest = Math.max(0, ...strong.map((t) => t.share));
  const fg = strong
    .filter((t) => t.share >= heaviest * 0.6)
    .sort((x, y) => y.contrast - x.contrast)[0];
  roles.fg = fg?.hex;
  roles.muted = readable.find(
    (t) => t.hex !== roles.fg && t.contrast < (fg?.contrast ?? 21) && hexChroma(t.hex) < 0.06,
  )?.hex;

  // The primary action color is what filled buttons use — chromatic first,
  // but an achromatic filled button (black-on-white, white-on-black sites)
  // still outranks a colored link; color in text alone is then the accent.
  const filled = buttons
    .map((b) => b.bg)
    .filter((c): c is string => isOpaque(c) && deltaE(c, bg) > 0.08);
  const chromaticFilled = filled.filter((c) => hexChroma(c) >= 0.06);
  roles.primary =
    mode(chromaticFilled) ??
    mode(filled) ??
    readable.find((t) => hexChroma(t.hex) >= 0.08)?.hex ??
    area.find((c) => hexChroma(c.hex) >= 0.08 && c.share >= 0.002)?.hex;
  const primaryLab = roles.primary ? hexToOklab(roles.primary) : null;
  const hue = (lab: OkLab | null): number => (lab ? (Math.atan2(lab.b, lab.a) * 180) / Math.PI : 0);
  roles.accent = [...area.map((c) => c.hex), ...readable.map((t) => t.hex)].find((hex) => {
    if (hex === roles.primary || hexChroma(hex) < 0.08) return false;
    const diff = Math.abs(hue(hexToOklab(hex)) - hue(primaryLab));
    return Math.min(diff, 360 - diff) > 30;
  });
  const border = raw.borderColor.find(
    ([hex]) => deltaE(solid(hex), bg) > 0.02 && deltaE(solid(hex), bg) < 0.35,
  );
  roles.border = border ? solid(border[0]) : undefined;

  const chromaticShare = area
    .filter((c) => hexChroma(c.hex) >= 0.06)
    .reduce((s, c) => s + c.share, 0);
  return {
    theme,
    roles,
    area: area.slice(0, 12),
    text: text.slice(0, 8),
    mediaShare: round(raw.samples.media / points, 0.001),
    gradientShare: round(raw.samples.gradient / points, 0.001),
    chromaticShare: round(chromaticShare, 0.001),
  };
}

function inferType(raw: DesignDnaRaw): DesignDna['type'] {
  const runs = parseText(raw);
  const chars = Math.max(
    1,
    runs.reduce((s, r) => s + r.chars, 0),
  );
  const families = raw.families.map(([f]) => f).filter((f) => f && !GENERIC_FONT.test(f));
  const textFamily = families.find((f) => !MONO_RE.test(f)) ?? families[0];
  const mono = families.find((f) => MONO_RE.test(f));
  const body = runs
    .filter((r) => !/^h[1-6]$/.test(r.tag) && r.size >= 11)
    .sort((x, y) => y.chars - x.chars)[0];

  const bySize = new Map<number, number>();
  for (const r of runs) bySize.set(r.size, (bySize.get(r.size) ?? 0) + r.chars);
  const headingSizes = new Set(runs.filter((r) => /^h[1-3]$/.test(r.tag)).map((r) => r.size));
  const scale = [...bySize]
    .filter(([size, n]) => n / chars >= 0.015 || headingSizes.has(size))
    .map(([size]) => size)
    .sort((x, y) => x - y);

  let ratio: number | null = null;
  if (body) {
    const above = scale.filter((s) => s > body.size * 1.04);
    if (above.length >= 2) {
      const steps = [body.size, ...above];
      let logSum = 0;
      for (let i = 1; i < steps.length; i++)
        logSum += Math.log((steps[i] as number) / (steps[i - 1] as number));
      ratio = round(Math.exp(logSum / (steps.length - 1)), 0.001);
    }
  }
  const largest = [...runs].sort((x, y) => y.size - x.size).slice(0, 3);
  const display = largest[0]?.family;
  const tracking = largest.length
    ? largest.reduce((s, r) => s + r.tracking / r.size, 0) / largest.length
    : null;
  const headingWeight =
    mode(runs.filter((r) => /^h[1-3]$/.test(r.tag)).map((r) => r.weight)) ?? null;
  const upper = runs.filter((r) => r.transform === 'uppercase').reduce((s, r) => s + r.chars, 0);
  return {
    text: textFamily,
    display:
      display && display !== textFamily && !GENERIC_FONT.test(display) ? display : textFamily,
    mono,
    loaded: raw.fontsLoaded,
    base: body
      ? {
          size: body.size,
          weight: body.weight,
          lineHeight: round(body.lineHeight / body.size, 0.01),
        }
      : null,
    scale,
    ratio,
    headingWeight,
    displayTracking: tracking === null ? null : round(tracking, 0.001),
    uppercaseShare: round(upper / chars, 0.001),
  };
}

const UNIT_CANDIDATES = [8, 6, 5, 4];

/** The largest unit most spacing values are multiples of, with its fit share. */
function inferSpacingUnit(values: DnaCounts): { unit: number | null; fit: number } {
  const usable = values.map(([v, n]) => [Number(v), n] as const).filter(([v]) => v >= 3);
  const weight = usable.reduce((s, [, n]) => s + n, 0);
  if (weight === 0) return { unit: null, fit: 0 };
  let best = { unit: null as number | null, fit: 0 };
  for (const unit of UNIT_CANDIDATES) {
    const fit =
      usable.reduce(
        (s, [v, n]) => (Math.abs(v / unit - Math.round(v / unit)) * unit <= 0.5 ? s + n : s),
        0,
      ) / weight;
    if (fit >= 0.75) return { unit, fit: round(fit, 0.01) };
    if (fit > best.fit) best = { unit, fit: round(fit, 0.01) };
  }
  return best;
}

function inferSpace(raw: DesignDnaRaw): DesignDna['space'] {
  const merged = new Map<string, number>();
  for (const list of [raw.padding, raw.gap, raw.vmargin])
    for (const [v, n] of list) merged.set(v, (merged.get(v) ?? 0) + n);
  const values: DnaCounts = [...merged].sort((x, y) => y[1] - x[1]);
  const { unit, fit } = inferSpacingUnit(values);
  const scale = values
    .slice(0, 12)
    .map(([v]) => Number(v))
    .filter((v) => v >= 2)
    .sort((x, y) => x - y);
  const padY = raw.sections.flatMap((s) => s.padY).filter((v) => v >= 16);
  return { unit, unitFit: fit, scale, sectionPadY: median(padY) };
}

function shadowKind(value: string): 'soft' | 'hard' | 'ring' {
  // Computed shadows read `color x y blur spread [inset]`, layers comma separated.
  const layers = value.split(/,(?![^(]*\))/);
  let kind: 'soft' | 'hard' | 'ring' = 'ring';
  for (const layer of layers) {
    const nums = (
      layer.replace(/rgba?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]+/gi, '').match(/-?[\d.]+px/g) ?? []
    ).map((p) => Number.parseFloat(p));
    const [x = 0, y = 0, blur = 0] = nums;
    if (blur > 0) return 'soft';
    if (x !== 0 || y !== 0) kind = 'hard';
  }
  return kind;
}

function inferShape(raw: DesignDnaRaw): DesignDna['shape'] {
  const radiusTotal = Math.max(1, total(raw.radius));
  const numeric = raw.radius.filter(([r]) => r !== 'full');
  const pill = raw.radius.find(([r]) => r === 'full')?.[1] ?? 0;
  const top = raw.radius[0];
  const shadowKinds = raw.shadow.map(([v, n]) => [shadowKind(v), n] as const);
  const byKind = new Map<string, number>();
  for (const [k, n] of shadowKinds) byKind.set(k, (byKind.get(k) ?? 0) + n);
  const kinds = [...byKind].sort((x, y) => y[1] - x[1]);
  const shadowTotal = total(raw.shadow);
  const shadowStyle: DesignDna['shape']['shadowStyle'] =
    kinds.length === 0
      ? 'none'
      : (kinds[0]?.[1] ?? 0) / shadowTotal >= 0.7
        ? (kinds[0]?.[0] as 'soft' | 'hard' | 'ring')
        : 'mixed';
  return {
    radius: top ? (top[0] === 'full' ? 'full' : Number(top[0])) : null,
    radiusScale: numeric
      .slice(0, 6)
      .map(([r]) => Number(r))
      .sort((x, y) => x - y),
    pillShare: round(pill / radiusTotal, 0.01),
    shadowStyle,
    shadowSamples: raw.shadow.slice(0, 3).map(([v]) => v),
    borderWidth: raw.borderW[0] ? Number(raw.borderW[0][0]) : null,
  };
}

function inferLayout(raw: DesignDnaRaw): DnaLayout {
  // Header/nav chrome is reported as `nav`; sections are the content rhythm.
  const sections = raw.sections.filter((s) => s.h >= 64 && !/^(header|nav)$/.test(s.tag));
  const containers = sections
    .map((s) => s.container)
    .filter((w) => w > 0)
    .map((w) => Math.round(w / 8) * 8);
  const wideGrids = raw.grids.filter(
    ([cols = 0, , children = 0, width = 0]) => cols >= 2 && children >= 2 && width >= raw.vw * 0.5,
  );
  return {
    width: raw.vw,
    container: mode(containers) ?? 0,
    sections: sections.map(({ y, h, cols, media, align, bg }) => {
      // A grid inside the section widens its column count beyond direct rows.
      const inner = raw.grids.filter(
        ([, , children = 0, , top = -1]) => children >= 2 && top >= y && top < y + h,
      );
      const gridCols = Math.max(0, ...inner.map(([c = 0]) => c));
      return { y, h, cols: Math.max(cols, gridCols), media, align, bg };
    }),
    maxGridCols: Math.max(0, ...wideGrids.map(([c = 0]) => c)),
    nav: raw.nav,
    docHeight: raw.docH,
  };
}

const MEANINGFUL_VAR = /^--(?![a-z]{1,3}-[0-9a-z]{6,}$)[a-z][\w-]*$/i;
const TOKEN_VALUE =
  /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch|color)a?\(|-?[\d.]+(px|rem|em|ms|s|%)?$|[\d.]+\s+[\d.]+%\s+[\d.]+%$)/i;

function declaredTokens(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(vars)) {
    if (Object.keys(out).length >= 60) break;
    if (MEANINGFUL_VAR.test(name) && value && TOKEN_VALUE.test(value)) out[name] = value;
  }
  return out;
}

function signalsFor(dna: Omit<DesignDna, 'signals' | 'notes'>, raws: DesignDnaRaw[]): string[] {
  const out: string[] = [];
  const wide = dna.layout[0];
  const narrow = dna.layout[dna.layout.length - 1];
  if (dna.theme === 'dark') out.push('dark-theme');
  const bgL = hexToOklab(dna.color.roles.bg ?? '#ffffff')?.L ?? 1;
  const inverted = dna.color.area
    .filter((c) => Math.abs((hexToOklab(c.hex)?.L ?? bgL) - bgL) > 0.5)
    .reduce((s, c) => s + c.share, 0);
  if (inverted >= 0.12) out.push('inverted-bands');
  if (wide?.nav && /sticky|fixed/.test(wide.nav.pos))
    out.push(wide.nav.backdrop ? 'glass-sticky-nav' : 'sticky-nav');
  if (wide) {
    const sided = wide.sections
      .filter((s) => s.media === 'left' || s.media === 'right')
      .map((s) => s.media);
    let alternations = 0;
    for (let i = 1; i < sided.length; i++) if (sided[i] !== sided[i - 1]) alternations++;
    if (sided.length >= 3 && alternations >= 2) out.push('alternating-media-rows');
    else if (sided.length >= 2) out.push('split-media-sections');
    if (wide.sections.filter((s) => s.media === 'full').length >= 2) out.push('full-bleed-media');
    if (wide.sections.some((s) => s.cols >= 3)) out.push('multi-column-grid');
    const first = wide.sections.find((s) => s.h >= 200);
    if (first?.align === 'center') out.push('centered-hero');
    else if (first?.align === 'start' || first?.align === 'left') out.push('left-aligned-hero');
  }
  if (wide && narrow && wide !== narrow && wide.maxGridCols > narrow.maxGridCols)
    out.push('grid-reflows-on-narrow');
  if (raws.some((r) => r.sections.some((s) => s.sticky && s.h > r.vh * 1.5)))
    out.push('sticky-scroll-narrative');
  if (dna.components.button?.radius === 'full') out.push('pill-buttons');
  if (dna.shape.shadowStyle === 'hard') out.push('hard-offset-shadows');
  if (dna.shape.radius === 0 || (typeof dna.shape.radius === 'number' && dna.shape.radius <= 2))
    out.push('square-corners');
  if (dna.type.mono && dna.type.mono !== dna.type.text) out.push('mono-accent-type');
  if (dna.type.display && dna.type.display !== dna.type.text) out.push('display-type-pairing');
  if ((dna.type.displayTracking ?? 0) <= -0.015) out.push('tight-display-tracking');
  if (dna.type.uppercaseShare >= 0.03) out.push('uppercase-labels');
  if (dna.color.mediaShare >= 0.3) out.push('media-heavy');
  if (dna.color.gradientShare >= 0.05) out.push('gradient-surfaces');
  if ((dna.effects.backdrop ?? 0) >= 3) out.push('glass-surfaces');
  if ((dna.type.base?.size ?? 16) <= 14) out.push('dense-type');
  if (
    dna.color.chromaticShare <= 0.02 &&
    dna.color.roles.primary &&
    hexChroma(dna.color.roles.primary) < 0.06
  )
    out.push('monochrome-palette');
  return out;
}

/**
 * Summarize one page measured at several viewports. The widest viewport
 * supplies color/type/shape (they rarely change by width); layout is kept per
 * viewport because reflow is the point of measuring more than one.
 */
export function summarizeDesignDna(
  raws: DesignDnaRaw[],
  capturedAt = new Date().toISOString(),
): DesignDna {
  if (raws.length === 0) throw new Error('design dna: no measurements to summarize');
  const ordered = [...raws].sort((x, y) => y.vw - x.vw);
  const wide = ordered[0] as DesignDnaRaw;
  const buttons = wide.buttons.filter((b) => isOpaque(b.bg) || b.border);
  const { theme, ...color } = inferColor(wide, wide.buttons);
  const type = inferType(wide);
  const primaryButton =
    buttons.find(
      (b) => b.bg && color.roles.primary && deltaE(solid(b.bg), color.roles.primary) < 0.02,
    ) ?? buttons[0];
  const input = wide.inputs[0];
  const base: Omit<DesignDna, 'signals' | 'notes'> = {
    version: 1,
    source: { url: wide.url, title: wide.title, capturedAt, viewports: ordered.map((r) => r.vw) },
    theme,
    color,
    type,
    space: inferSpace(wide),
    shape: inferShape(wide),
    motion: {
      duration: wide.duration[0] ? Number(wide.duration[0][0]) : null,
      durations: wide.duration.slice(0, 5).map(([d]) => Number(d)),
      easing: wide.easing[0]?.[0] ?? null,
      animated: wide.effects.animated ?? 0,
    },
    components: {
      button: primaryButton
        ? {
            h: primaryButton.h,
            padX: primaryButton.padX,
            radius: primaryButton.r,
            weight: Number(primaryButton.fw),
            size: primaryButton.fs,
            transform: primaryButton.tt,
          }
        : null,
      input: input ? { h: input.h, radius: input.r, borderWidth: input.bw } : null,
    },
    layout: ordered.map(inferLayout),
    effects: wide.effects,
    declaredTokens: declaredTokens(wide.vars),
  };
  const notes: string[] = [];
  const unloaded = [type.text, type.display, type.mono].filter(
    (f): f is string => !!f && !type.loaded.some((l) => l.toLowerCase() === f.toLowerCase()),
  );
  if (unloaded.length)
    notes.push(
      `Font(s) ${[...new Set(unloaded)].join(', ')} were declared but not seen in document.fonts — they may be system fonts or the rendered text may use a fallback.`,
    );
  if (color.mediaShare >= 0.25)
    notes.push(
      `${Math.round(color.mediaShare * 100)}% of sampled area is image/video/canvas — its colors are not in the palette.`,
    );
  if (Object.keys(wide.vars).length === 0)
    notes.push(
      'No :root custom properties were readable (none declared, or stylesheets are cross-origin).',
    );
  if (wide.screens < Math.ceil(wide.docH / wide.vh))
    notes.push(
      `Color was sampled over the first ${wide.screens} screens of a ${Math.ceil(wide.docH / wide.vh)}-screen page.`,
    );
  if (!type.base) notes.push('No body text was measured; the type scale is unreliable.');
  if ((wide.effects.animated ?? 0) > 50)
    notes.push(
      'Many running animations: reveal-on-scroll content may have been mid-transition when measured.',
    );
  return { ...base, signals: signalsFor(base, ordered), notes };
}
