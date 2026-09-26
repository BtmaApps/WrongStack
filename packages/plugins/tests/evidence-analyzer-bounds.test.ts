import { describe, expect, it } from 'vitest';
import {
  analyzeEvidence,
  EVIDENCE_ANALYZE_BUDGET_MS,
  EVIDENCE_MATCH_WINDOW,
  type EvidenceAnalyzerProfile,
} from '../src/evidence-analyzer/index.js';

/**
 * NV-2 (security-check 2026-09-26): the rules are backtracking-heavy — two
 * `.*` in a row is O(n^3) on a line of the first two words without the third —
 * and they ran over the whole (up to 1 MB) evidence on the host event loop.
 * One crafted line froze the session; the tools are `auto`, and the evidence
 * can be a log file the repository ships.
 */
const profile = (pattern: RegExp): EvidenceAnalyzerProfile => ({
  name: 'probe',
  toolName: 'probe_analyze',
  description: 'probe',
  evidenceHint: 'probe',
  rules: [{ label: 'hit', severity: 'error', pattern, advice: 'x' }],
});

const BUNDLE_BUDGET = /(?:bundle|asset|chunk).*(?:budget|limit).*(?:exceeded|over)/i;

describe('analyzeEvidence bounds', () => {
  it('finishes on a long adversarial line instead of hanging', () => {
    // Before windowing, 60 KB of this took minutes (cubic backtracking over
    // the whole line); each window is now at most EVIDENCE_MATCH_WINDOW.
    const line = 'bundle budget '.repeat(60_000 / 14);
    const started = Date.now();
    const result = analyzeEvidence(line, profile(BUNDLE_BUDGET), 50);
    expect(result.findings).toEqual([]);
    expect(Date.now() - started).toBeLessThan(EVIDENCE_ANALYZE_BUDGET_MS * 5);
  });

  it('stops at the budget and says the result is partial', () => {
    let clock = 0;
    const now = () => clock++ * EVIDENCE_ANALYZE_BUDGET_MS; // every check is past the deadline
    const result = analyzeEvidence(
      'bundle budget exceeded\n'.repeat(10),
      profile(BUNDLE_BUDGET),
      50,
      now,
    );
    expect(result.partial).toBe(true);
  });

  it('still finds a match past the first window of a long line, with its line number', () => {
    const content = `ok\n${'x'.repeat(EVIDENCE_MATCH_WINDOW * 2)} bundle budget exceeded\n`;
    const result = analyzeEvidence(content, profile(BUNDLE_BUDGET), 50);
    expect(result).toMatchObject({ partial: false, findings: [{ line: 2 }] });
  });

  it('does not read a window boundary as a line start for ^ rules', () => {
    const rule = /^export\s+const\s+/m;
    const midLine = `${'y'.repeat(EVIDENCE_MATCH_WINDOW - 1)}export const x = 1`;
    expect(analyzeEvidence(midLine, profile(rule), 50).findings).toEqual([]);
    expect(analyzeEvidence(`a\nexport const x = 1\n`, profile(rule), 50).findings).toMatchObject([
      { line: 2 },
    ]);
  });
});
