import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A11y static boundaries gate (WCAG 2.1 AA audit, 2026-10-24).
 *
 * Mirrors theme-color-boundaries.test.ts / english-leak-boundaries.test.ts:
 * a source scanner with a zero-hit gate over the current tree. Three defect
 * classes are enforced:
 *
 * 1. unlabeled-control — <input>/<textarea>/<select> without an accessible
 *    name (aria-label, aria-labelledby, title, id) and without an implicit
 *    <label> ancestor. Placeholder text is NOT a label (WCAG 3.3.2/4.1.2).
 * 2. clickable-non-interactive — onClick on static elements (div/span/li/…)
 *    without role/tabIndex/onKeyDown/aria-hidden and without an explicit
 *    `biome-ignore lint/a11y` exemption comment (backdrop-with-Escape).
 * 3. heading-skip — per-file heading levels that jump down by 2+
 *    (h1 → h3) in document order (WCAG 1.3.1 Info and Relationships).
 *
 * Exemptions are structural, not per-file allowlists: visually hidden inputs
 * (`hidden`/`sr-only` class), `type="hidden"`, aria-hidden elements, and
 * attribute spreads (name supplied by the caller) never flag.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, '../../src');

/** JSX opening/self-closing tags; attributes may contain `=>` callbacks. */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:=>|[^>])*)>/g;

type Hit = { file: string; line: number; kind: string; detail: string };

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}=`).test(attrs);
}

/** True when the attribute name appears, with or without a JSX `="value"`. */
function hasWord(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(attrs);
}

function scanFile(relative: string, source: string): Hit[] {
  const hits: Hit[] = [];
  // Strip JSX comment content (same length, newlines preserved) so scanner
  // patterns cannot match markup mentioned inside comments, e.g. "plain <select>".
  const cleaned = source.replace(/\{\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const srcLines = cleaned.split('\n');
  // A `biome-ignore lint/a11y` comment on the line(s) directly above an element
  // is a recorded exemption (backdrop click-away with an Escape alternative).
  const exemptionAbove = (line: number): string =>
    srcLines.slice(Math.max(0, line - 3), Math.max(0, line - 1)).join('\n');
  const events: {
    closing: boolean;
    tag: string;
    attrs: string;
    line: number;
    selfClosing: boolean;
  }[] = [];
  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(cleaned); m !== null; m = TAG_RE.exec(cleaned)) {
    const [, closing, tag, attrs] = m;
    events.push({
      closing: closing === '/',
      tag,
      attrs,
      selfClosing: closing === '/' || /\/\s*$/.test(attrs),
      line: source.slice(0, m.index).split('\n').length,
    });
  }

  let labelDepth = 0;
  for (const ev of events) {
    const isLabel = ev.tag === 'label';
    if (isLabel && !ev.closing && !ev.selfClosing) labelDepth += 1;

    if (!ev.closing && ['input', 'textarea', 'select'].includes(ev.tag)) {
      const named = ['aria-label', 'aria-labelledby', 'id', 'title'].some((n) =>
        hasAttr(ev.attrs, n),
      );
      const hidden = hasWord(ev.attrs, 'aria-hidden') || /type=\{?"hidden"/.test(ev.attrs);
      const visuallyHidden = /class(?:Name)?="[^"]*\b(?:hidden|sr-only)\b/.test(ev.attrs);
      const spread = /\{\.\.\./.test(ev.attrs);
      if (!named && !hidden && !visuallyHidden && !spread && labelDepth === 0) {
        hits.push({
          file: relative,
          line: ev.line,
          kind: 'unlabeled-control',
          detail: `<${ev.tag}>`,
        });
      }
    }

    if (
      !ev.closing &&
      ['div', 'span', 'li', 'td', 'tr', 'p'].includes(ev.tag) &&
      hasAttr(ev.attrs, 'onClick')
    ) {
      const interactive =
        ['role', 'tabIndex', 'onKeyDown'].some((n) => hasAttr(ev.attrs, n)) ||
        hasWord(ev.attrs, 'aria-hidden');
      const exempted = /biome-ignore\s+lint\/a11y/.test(`${ev.attrs}\n${exemptionAbove(ev.line)}`);
      if (!interactive && !exempted && !/\{\.\.\./.test(ev.attrs)) {
        hits.push({
          file: relative,
          line: ev.line,
          kind: 'clickable-non-interactive',
          detail: `<${ev.tag} onClick>`,
        });
      }
    }

    if (isLabel && ev.closing && labelDepth > 0) labelDepth -= 1;
  }

  const heads = events.filter((ev) => !ev.closing && /^h[1-6]$/.test(ev.tag));
  for (let i = 1; i < heads.length; i += 1) {
    const prev = Number(heads[i - 1].tag[1]);
    const cur = Number(heads[i].tag[1]);
    if (cur > prev + 1) {
      hits.push({
        file: relative,
        line: heads[i].line,
        kind: 'heading-skip',
        detail: `h${prev} → h${cur}`,
      });
    }
  }

  return hits;
}

function componentFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      componentFiles(full, files);
      continue;
    }
    if (/\.tsx$/.test(entry) && !/\.test\./.test(entry)) files.push(full);
  }
  return files;
}

function scanTree(): Hit[] {
  return componentFiles(SRC_ROOT).flatMap((file) => {
    const relative = path.relative(SRC_ROOT, file).replaceAll('\\', '/');
    return scanFile(relative, readFileSync(file, 'utf8'));
  });
}

describe('A11y static boundaries', () => {
  it('self-test: scanner catches each defect class on a fixture', () => {
    const fixture = [
      '<input value={q} onChange={(e) => setQ(e.target.value)} />',
      '<div onClick={close}>x</div>',
      '<h1>Title</h1>',
      '<h3>Section</h3>',
      '<input aria-label={t("q")} value={q} onChange={(e) => setQ(e.target.value)} />',
      '<label>Role<input value={r} onChange={(e) => setR(e.target.value)} /></label>',
      '<div role="button" tabIndex={0} onClick={go}>go</div>',
      '<h2>Sub</h2>',
    ].join('\n');
    const hits = scanFile('fixture.tsx', fixture);
    expect(hits.map((h) => h.kind)).toEqual([
      'unlabeled-control',
      'clickable-non-interactive',
      'heading-skip',
    ]);
  });

  it('zero unlabeled form controls in src', () => {
    const hits = scanTree().filter((h) => h.kind === 'unlabeled-control');
    expect(hits).toEqual([]);
  });

  it('zero click handlers without keyboard semantics in src', () => {
    const hits = scanTree().filter((h) => h.kind === 'clickable-non-interactive');
    expect(hits).toEqual([]);
  });

  it('zero heading-level skips in src', () => {
    const hits = scanTree().filter((h) => h.kind === 'heading-skip');
    expect(hits).toEqual([]);
  });
});
