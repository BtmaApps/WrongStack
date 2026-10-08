import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Shadow-intent gate (design brief, Follow-up 12 finding 5).
 *
 * packages/webui/src/index.css defines the system's warm-ink elevation tiers
 * (shadow-2xs … shadow-lg resolve through `--shadow-color`, so they stay
 * legal). Heavy floats (`shadow-xl`, `shadow-2xl`) belong to the
 * `ws-dialog` / `ws-surface` intent classes — stock heavy shadows are drift.
 *
 * Why a test gate and not a Biome plugin: Biome 2.5.13's GritQL plugins can
 * match code-structure snippets (identifiers, call shapes) but cannot see
 * inside JS string literals — regex `<: r"..."`, string-metavariable patterns
 * and `contains raw` all failed empirically on 2026-10-07. This walker is the
 * repo-precedent equivalent (mirrors theme-color-boundaries.test.ts).
 */

const SRC_ROOT = path.resolve(import.meta.dirname, '../../src');
const STOCK_HEAVY_SHADOW = /\bshadow-(?:xl|2xl)\b/;

type Hit = { file: string; line: number; text: string };

function scanDir(dir: string, hits: Hit[] = []): Hit[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      scanDir(full, hits);
      continue;
    }
    if (/\.(css|md)$/.test(entry) || /\.test\./.test(entry)) continue;
    const content = readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (STOCK_HEAVY_SHADOW.test(lines[i])) {
        hits.push({
          file: path.relative(SRC_ROOT, full).replaceAll('\\', '/'),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
  return hits;
}

describe('shadow-intent boundaries', () => {
  it('detects stock heavy shadows in a fixture (gate self-test)', () => {
    const fixture = [
      "ok: 'ws-dialog bg-card'",
      "drift: 'fixed inset-0 shadow-2xl bg-card'",
      "drift: 'rounded-lg border shadow-xl'",
      "legal tier: 'shadow-sm'",
    ].join('\n');
    const hits = fixture
      .split(/\r?\n/)
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(({ text }) => STOCK_HEAVY_SHADOW.test(text));
    expect(hits.map((h) => h.line)).toEqual([2, 3]);
  });

  it('keeps webui src free of stock shadow-xl/shadow-2xl', () => {
    const hits = scanDir(SRC_ROOT);
    const report = hits.map((h) => `${h.file}:${h.line} — ${h.text}`).join('\n');
    expect(
      report,
      `Stock heavy shadows are design drift: replace shadow-xl/shadow-2xl with the ws-dialog intent class (or drop it where ws-dialog/ws-sheet already owns the shadow). Light tiers shadow-2xs..lg are legal.\n${report}`,
    ).toBe('');
  });
});
