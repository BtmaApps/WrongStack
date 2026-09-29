import type { MemoryEvidenceSnapshot } from '@wrongstack/sage';

export { type MemoryEvidenceSnapshot, snapshotMemoryEvidence } from '@wrongstack/sage';

export interface MemoryCompanionVerdict {
  verdict: 'supported' | 'outdated' | 'contradicted' | 'unverifiable' | 'irrelevant';
  summary: string;
  evidence: Array<{ path: string; quote: string }>;
}

export function parseMemoryCompanionVerdict(
  raw: string,
  snapshot: MemoryEvidenceSnapshot,
): MemoryCompanionVerdict | undefined {
  try {
    if (raw.length > 8000) return;
    const value = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    ) as MemoryCompanionVerdict;
    if (
      !['supported', 'outdated', 'contradicted', 'unverifiable', 'irrelevant'].includes(
        value.verdict,
      ) ||
      typeof value.summary !== 'string' ||
      !value.summary.trim() ||
      value.summary.length > 800 ||
      !Array.isArray(value.evidence) ||
      value.evidence.length > 4
    )
      return;
    if (
      value.evidence.some(
        (e) =>
          !e ||
          typeof e.path !== 'string' ||
          typeof e.quote !== 'string' ||
          e.quote.trim().length < 12 ||
          e.quote.length > 400 ||
          !snapshot.files.some((f) => f.path === e.path && f.text.includes(e.quote)),
      )
    )
      return;
    if (
      ['supported', 'outdated', 'contradicted'].includes(value.verdict) &&
      value.evidence.length === 0
    )
      return;
    return {
      verdict: value.verdict,
      summary: value.summary,
      evidence: value.evidence.map(({ path, quote }) => ({ path, quote })),
    };
  } catch {
    return;
  }
}
