/**
 * Build-time PostCSS plugin behind the typography panel's "interface text
 * size" control.
 *
 * The WebUI sizes text two ways: ~1650 arbitrary `text-[11px]` classes and
 * ~1700 rem-based `text-xs`/`text-sm` classes, plus hand-written `font-size`
 * declarations in the stylesheets. Rewriting every call site would be a huge,
 * collision-prone diff, and a root `font-size` change would only reach the rem
 * half (and would also scale Tailwind spacing). Instead this plugin rewrites
 * the *compiled* declarations once:
 *
 *   font-size: 11px              → font-size: calc(11px * var(--ui-font-scale, 1))
 *   font-size: var(--text-xs)    → font-size: calc(var(--text-xs) * var(--ui-font-scale, 1))
 *   line-height: 16px            → line-height: calc(16px * var(--ui-font-scale, 1))
 *
 * so one CSS variable on <html> scales every absolute text size. Relative
 * values (`em`, `%`, unitless line-heights) already follow their parent and
 * are left alone — wrapping them would apply the scale twice. Third-party CSS
 * (Monaco, xterm, React Flow — anything under `node_modules`) is skipped: those
 * widgets size themselves from JS options that the font settings feed directly.
 */

export const UI_FONT_SCALE_VAR = '--ui-font-scale';

const ABSOLUTE_LENGTH = /-?(?:\d+\.?\d*|\.\d+)(?:px|rem)\b/;
const TEXT_TOKEN = /var\(--text-[\w-]+\)/;
const RELATIVE_LENGTH = /(?:\d|\.)(?:em|ex|ch|%|vw|vh|vmin|vmax|cqw|cqh|lh)\b|%/;

type ScalableProperty = 'font-size' | 'line-height';

export function isScalableProperty(prop: string): prop is ScalableProperty {
  return prop === 'font-size' || prop === 'line-height';
}

/** Returns the scaled value, or `null` when the declaration must stay as-is. */
export function scaleTypographyValue(prop: ScalableProperty, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes(UI_FONT_SCALE_VAR)) return null;
  // `1.2em`, `85%`, `calc(1em + 2px)`: already relative to the (scaled) parent.
  if (RELATIVE_LENGTH.test(trimmed.replace(/var\([^)]*\)/g, ''))) return null;
  const scalable =
    ABSOLUTE_LENGTH.test(trimmed) || (prop === 'font-size' && TEXT_TOKEN.test(trimmed));
  if (!scalable) return null;
  return `calc(${trimmed} * var(${UI_FONT_SCALE_VAR}, 1))`;
}

interface DeclarationLike {
  prop: string;
  value: string;
  source?: { input?: { file?: string | undefined } | undefined } | undefined;
}

export interface FontScalePluginOptions {
  /** Decide per source file; default skips anything under `node_modules`. */
  include?: ((file: string | undefined) => boolean) | undefined;
}

const defaultInclude = (file: string | undefined): boolean =>
  !file || !/[\\/]node_modules[\\/]/.test(file);

export function fontScalePostcssPlugin(options: FontScalePluginOptions = {}) {
  const include = options.include ?? defaultInclude;
  return {
    postcssPlugin: 'wrongstack-ui-font-scale',
    Declaration(decl: DeclarationLike) {
      if (!isScalableProperty(decl.prop)) return;
      if (!include(decl.source?.input?.file)) return;
      const next = scaleTypographyValue(decl.prop, decl.value);
      if (next !== null) decl.value = next;
    },
  };
}
