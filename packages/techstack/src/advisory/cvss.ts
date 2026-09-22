/**
 * TechStack — CVSS base-score computation from vector strings.
 *
 * OSV severity entries carry the full vector string in `score`
 * (`CVSS:3.1/AV:N/AC:L/...`), not a number, so a numeric base score must be
 * computed per the CVSS 3.1 / 2.0 specifications before severity bands can be
 * applied. `parseFloat` on a vector yields NaN.
 */

/** CVSS v3.1 weight tables (spec §2; PR depends on scope). */
const AV3: Readonly<Record<string, number>> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC3: Readonly<Record<string, number>> = { L: 0.77, H: 0.44 };
const PR3_UNCHANGED: Readonly<Record<string, number>> = { N: 0.85, L: 0.62, H: 0.27 };
const PR3_CHANGED: Readonly<Record<string, number>> = { N: 0.85, L: 0.68, H: 0.5 };
const UI3: Readonly<Record<string, number>> = { N: 0.85, R: 0.62 };
const CIA3: Readonly<Record<string, number>> = { H: 0.56, L: 0.22, N: 0 };

/** CVSS v2 weight tables (spec §2). */
const AV2: Readonly<Record<string, number>> = { N: 1, A: 0.647, L: 0.395 };
const AC2: Readonly<Record<string, number>> = { L: 0.71, M: 0.61, H: 0.35 };
const AU2: Readonly<Record<string, number>> = { N: 0.704, S: 0.56, M: 0.45 };
const CIA2: Readonly<Record<string, number>> = { C: 0.66, P: 0.275, N: 0 };

/**
 * Spec-defined roundup (CVSS 3.1 Appendix A): the smallest 1-decimal number
 * that is >= the input, guarded against binary floating-point drift.
 */
function roundup3(input: number): number {
  const scaled = Math.round(input * 100_000);
  return scaled % 10_000 === 0 ? scaled / 100_000 : (Math.floor(scaled / 10_000) + 1) / 10;
}

/** Parse `KEY:VALUE/KEY:VALUE/...` into an upper-cased metric map. */
function parseMetrics(vector: string): Map<string, string> {
  const metrics = new Map<string, string>();
  for (const part of vector.split('/')) {
    const separator = part.indexOf(':');
    if (separator <= 0) continue;
    metrics.set(part.slice(0, separator).toUpperCase(), part.slice(separator + 1).toUpperCase());
  }
  return metrics;
}

function cvss31(vector: string): number | undefined {
  const metrics = parseMetrics(vector);
  const av = AV3[metrics.get('AV') ?? ''];
  const ac = AC3[metrics.get('AC') ?? ''];
  const scope = metrics.get('S');
  const pr =
    scope === 'C' ? PR3_CHANGED[metrics.get('PR') ?? ''] : PR3_UNCHANGED[metrics.get('PR') ?? ''];
  const ui = UI3[metrics.get('UI') ?? ''];
  const c = CIA3[metrics.get('C') ?? ''];
  const i = CIA3[metrics.get('I') ?? ''];
  const a = CIA3[metrics.get('A') ?? ''];
  if (
    av === undefined ||
    ac === undefined ||
    pr === undefined ||
    ui === undefined ||
    c === undefined ||
    i === undefined ||
    a === undefined ||
    (scope !== 'U' && scope !== 'C')
  ) {
    return undefined;
  }
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scope === 'C' ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  const exploitability = 8.22 * av * ac * pr * ui;
  if (impact <= 0) return 0;
  return roundup3(Math.min(impact + exploitability, 10));
}

function cvss20(vector: string): number | undefined {
  const metrics = parseMetrics(vector);
  const av = AV2[metrics.get('AV') ?? ''];
  const ac = AC2[metrics.get('AC') ?? ''];
  const au = AU2[metrics.get('AU') ?? ''];
  const c = CIA2[metrics.get('C') ?? ''];
  const i = CIA2[metrics.get('I') ?? ''];
  const a = CIA2[metrics.get('A') ?? ''];
  if (
    av === undefined ||
    ac === undefined ||
    au === undefined ||
    c === undefined ||
    i === undefined ||
    a === undefined
  ) {
    return undefined;
  }
  const impact = 10.41 * (1 - (1 - c) * (1 - i) * (1 - a));
  const exploitability = 20 * av * ac * au;
  const fImpact = impact === 0 ? 0 : 1.176;
  // The reference calculators clamp the base score to the 0..10 range.
  const score = ((0.6 * impact + 0.4 * exploitability - 1.176) * fImpact * 10) / 10;
  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

/**
 * Compute the base score for an OSV severity entry.
 *
 * Temporal/environmental metrics in the vector are ignored — base scores only
 * use the base metrics. Returns `undefined` when the type is unknown or the
 * vector is missing required metrics.
 */
export function cvssBaseScore(type: string, vector: string): number | undefined {
  if (type === 'CVSS_V3') return cvss31(vector);
  if (type === 'CVSS_V2') return cvss20(vector);
  return undefined;
}
