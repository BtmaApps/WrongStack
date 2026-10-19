/**
 * DESIGN.md diff — what changed between two versions of a design system, and
 * which changes are regressions.
 *
 * A text diff of the YAML shows that `primary` moved; it does not show that
 * the move took `on-primary` below 4.5:1, or that a removed spacing token is
 * still referenced by a component. This compares the parsed token sets:
 *
 * - FAIL: a text/background pair that met WCAG AA (4.5:1) no longer does, in
 *   either theme; a component reference that resolved before no longer does.
 * - WARN: a token or component was removed (consumers may still use it); a
 *   font family changed (a brand-level change, worth stating in the PR).
 * - INFO: values that changed, with the OKLab distance for colors so an
 *   imperceptible nudge (ΔE ≤ 0.02, the DNA tolerance) reads as one.
 */

import { colorToHex, contrastRatio } from './design-color.js';
import { deltaE } from './design-dna-color.js';
import { type DesignMdDoc, resolveDesignMdRef } from './design-md.js';

export interface DesignMdChange {
  severity: 'FAIL' | 'WARN' | 'INFO';
  path: string;
  message: string;
}

const AA = 4.5;
const IMPERCEPTIBLE = 0.02;
const GROUPS = ['colors', 'rounded', 'spacing'] as const;

/** Text/background role pairs worth guarding; `on-X` on `X` is added per doc. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['fg', 'bg'],
  ['text', 'background'],
  ['foreground', 'background'],
  ['muted-fg', 'bg'],
  ['muted-foreground', 'background'],
  ['fg', 'surface'],
  ['text', 'surface'],
];

function pairsOf(doc: DesignMdDoc): Array<[string, string]> {
  const names = Object.keys(doc.colors).filter((n) => !n.startsWith('dark-'));
  const onPairs = names
    .filter((n) => n.startsWith('on-') && names.includes(n.slice(3)))
    .map((n): [string, string] => [n, n.slice(3)]);
  return [...TEXT_PAIRS, ...onPairs].filter(([fg, bg]) => names.includes(fg) && names.includes(bg));
}

/** Contrast of a pair in a theme; dark falls back to the light value per role. */
function pairRatio(doc: DesignMdDoc, fg: string, bg: string, dark: boolean): number | null {
  const pick = (role: string) =>
    dark ? (doc.colors[`dark-${role}`] ?? doc.colors[role]) : doc.colors[role];
  const a = pick(fg);
  const b = pick(bg);
  const ah = a ? colorToHex(a) : null;
  const bh = b ? colorToHex(b) : null;
  return ah && bh ? contrastRatio(ah, bh) : null;
}

function describeColor(before: string, after: string): string {
  const a = colorToHex(before);
  const b = colorToHex(after);
  if (!a || !b) return `${before} → ${after}`;
  const d = deltaE(a, b);
  return `${before} → ${after} (ΔE ${d.toFixed(3)}${d <= IMPERCEPTIBLE ? ', imperceptible' : ''})`;
}

export function diffDesignMd(before: DesignMdDoc, after: DesignMdDoc): DesignMdChange[] {
  const out: DesignMdChange[] = [];
  const referenced = new Set<string>();
  for (const props of Object.values(after.components)) {
    for (const v of Object.values(props)) {
      const m = /^\{([a-z]+)\.([\w-]+)\}$/.exec(v.trim());
      if (m) referenced.add(`${m[1]}.${m[2]}`);
    }
  }

  for (const group of GROUPS) {
    const a = before[group] as Record<string, string | number>;
    const b = after[group] as Record<string, string | number>;
    for (const name of Object.keys(a)) {
      const key = `${group}.${name}`;
      if (!(name in b)) {
        // A removal still referenced is reported once, as the broken ref below.
        if (!referenced.has(key))
          out.push({ severity: 'WARN', path: key, message: `removed (was ${a[name]})` });
      } else if (String(a[name]) !== String(b[name])) {
        out.push({
          severity: 'INFO',
          path: key,
          message:
            group === 'colors'
              ? describeColor(String(a[name]), String(b[name]))
              : `${a[name]} → ${b[name]}`,
        });
      }
    }
    for (const name of Object.keys(b)) {
      if (!(name in a))
        out.push({ severity: 'INFO', path: `${group}.${name}`, message: `added (${b[name]})` });
    }
  }

  for (const [level, ta] of Object.entries(before.typography)) {
    const tb = after.typography[level];
    if (!tb) {
      out.push({ severity: 'WARN', path: `typography.${level}`, message: 'removed' });
      continue;
    }
    if (ta.fontFamily && tb.fontFamily && ta.fontFamily !== tb.fontFamily) {
      out.push({
        severity: 'WARN',
        path: `typography.${level}.fontFamily`,
        message: `${ta.fontFamily} → ${tb.fontFamily} (a brand-level change; state it)`,
      });
    }
    for (const prop of ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const) {
      if (ta[prop] !== undefined && String(ta[prop]) !== String(tb[prop])) {
        out.push({
          severity: 'INFO',
          path: `typography.${level}.${prop}`,
          message: `${ta[prop]} → ${tb[prop] ?? '(unset)'}`,
        });
      }
    }
  }

  for (const [fg, bg] of pairsOf(before)) {
    for (const dark of [false, true]) {
      const was = pairRatio(before, fg, bg, dark);
      const now = pairRatio(after, fg, bg, dark);
      if (was !== null && now !== null && was >= AA && now < AA) {
        out.push({
          severity: 'FAIL',
          path: `colors.${dark ? 'dark-' : ''}${fg} on ${bg}`,
          message: `contrast ${was.toFixed(2)}:1 → ${now.toFixed(2)}:1, below WCAG AA ${AA}:1`,
        });
      }
    }
  }

  for (const [name, props] of Object.entries(before.components)) {
    const next = after.components[name];
    if (!next) {
      out.push({ severity: 'WARN', path: `components.${name}`, message: 'removed' });
      continue;
    }
    for (const [prop, value] of Object.entries(next)) {
      if (
        resolveDesignMdRef(after, value) === undefined &&
        (props[prop] === undefined || resolveDesignMdRef(before, props[prop]) !== undefined)
      ) {
        out.push({
          severity: 'FAIL',
          path: `components.${name}.${prop}`,
          message: `${value} no longer resolves`,
        });
      }
    }
    const fa =
      props.textColor && props.backgroundColor ? [props.textColor, props.backgroundColor] : null;
    const fb =
      next.textColor && next.backgroundColor ? [next.textColor, next.backgroundColor] : null;
    if (fa && fb) {
      const ratio = (doc: DesignMdDoc, [t, g]: string[]) => {
        const th = colorToHex(resolveDesignMdRef(doc, t ?? '') ?? '');
        const gh = colorToHex(resolveDesignMdRef(doc, g ?? '') ?? '');
        return th && gh ? contrastRatio(th, gh) : null;
      };
      const was = ratio(before, fa);
      const now = ratio(after, fb);
      if (was !== null && now !== null && was >= AA && now < AA) {
        out.push({
          severity: 'FAIL',
          path: `components.${name}`,
          message: `text on background ${was.toFixed(2)}:1 → ${now.toFixed(2)}:1, below WCAG AA ${AA}:1`,
        });
      }
    }
  }

  const rank = { FAIL: 0, WARN: 1, INFO: 2 } as const;
  return out.sort((x, y) => rank[x.severity] - rank[y.severity] || x.path.localeCompare(y.path));
}

export function renderDesignMdDiff(changes: readonly DesignMdChange[], label: string): string {
  if (changes.length === 0) return `${label}: no token changes.`;
  const count = (s: DesignMdChange['severity']) => changes.filter((c) => c.severity === s).length;
  return [
    `${label}: ${count('FAIL')} FAIL · ${count('WARN')} WARN · ${count('INFO')} INFO`,
    ...changes.map((c) => `  ${c.severity} ${c.path}: ${c.message}`),
  ].join('\n');
}
