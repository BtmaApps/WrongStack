import { describe, expect, it } from 'vitest';
import ciFailureTriage from '../src/ci-failure-triage/index.js';
import {
  analyzeEvidence,
  EVIDENCE_ANALYZE_BUDGET_MS,
  EVIDENCE_MATCH_OVERLAP,
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

  // The window reached BACK by the overlap but not FORWARD, so a match that
  // started more than the overlap before a window boundary AND ran past that
  // boundary fit in no window at all and was silently dropped — the tool
  // reported zero findings on evidence that did contain one. Sweep ground truth
  // before the fix: start=767 span>=300 -> 0, start=400 span=800 -> 0.
  it('finds a match that straddles a window boundary by more than the overlap', () => {
    // A line where the match begins just inside the previous window's reach-back
    // (offset - OVERLAP - 1) and ends well past the boundary.
    const matchLen = 300;
    const start = EVIDENCE_MATCH_WINDOW - EVIDENCE_MATCH_OVERLAP - 1;
    const prefix = 'x'.repeat(start);
    const match = `START${'y'.repeat(matchLen - 'START'.length - 'END'.length)}END`;
    const line = prefix + match + 'z'.repeat(2000);
    const rule = /START[\s\S]*?END/;
    const result = analyzeEvidence(line, profile(rule), 50);
    expect(result.findings).toHaveLength(1);
  });

  it('finds a long match that starts well before the boundary and runs past it', () => {
    const start = 400;
    const matchLen = 800;
    const prefix = 'x'.repeat(start);
    const match = `START${'y'.repeat(matchLen - 'START'.length - 'END'.length)}END`;
    const line = prefix + match + 'z'.repeat(2000);
    const rule = /START[\s\S]*?END/;
    expect(analyzeEvidence(line, profile(rule), 50).findings).toHaveLength(1);
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

/**
 * Drive the REAL ci-failure-triage plugin (its `ci_failure_triage` tool) so the
 * shipped profile rules are exercised through the same analyzeEvidence windowing
 * every evidence-analyzer profile shares. Two properties pinned here:
 *   1. a match that straddles a window boundary is FOUND (the forward reach);
 *   2. a single logical match is reported EXACTLY once — the forward reach makes
 *      an overlap-region match visible in two windows, and the start-offset dedup
 *      must not double-report it.
 */
describe('ci-failure-triage rules under the windowing', () => {
  const registered: Array<{
    name: string;
    execute: (i: unknown, c: unknown) => Promise<{ findings: { rule: string; line: number }[] }>;
  }> = [];
  const api = {
    tools: {
      register: (t: {
        name: string;
        execute: (
          i: unknown,
          c: unknown,
        ) => Promise<{ findings: { rule: string; line: number }[] }>;
      }) => registered.push(t),
    },
    config: { extensions: { 'ci-failure-triage': { enabled: true, maxFindings: 200 } } },
    log: { info: () => {}, warn: () => {} },
  };
  (ciFailureTriage.setup as (a: unknown) => void)(api);
  const run = async (content: string) => {
    const tool = registered.find((t) => t.name === 'ci_failure_triage');
    if (!tool) throw new Error('ci_failure_triage not registered');
    const res = await tool.execute({ content }, { projectRoot: process.cwd() });
    return res.findings;
  };
  const count = (fs: { rule: string }[], rule: string) => fs.filter((f) => f.rule === rule).length;
  const NET = 'transient network or registry failure';
  const TYPE = 'type-check failure';

  // '.' filler (non-word) so a token's first char sits on a real \b boundary;
  // an 'x' filler would butt 'x' against 'T' in TS1234 and defeat the match.
  const line = (tokens: Array<[number, string]>, total = 3000): string => {
    const buf = Array.from<string>({ length: total }, () => '.');
    for (const [at, text] of tokens) for (let i = 0; i < text.length; i++) buf[at + i] = text[i]!;
    return buf.join('');
  };

  it('finds a registry..503 match that straddles a window boundary, exactly once', async () => {
    // `registry` sits 624 chars before the 1024 boundary (past the 257
    // reach-back) and `503` 176 chars after it — the geometry the old
    // backward-only windowing dropped.
    const findings = await run(
      line([
        [400, 'registry'],
        [1200, '503'],
      ]),
    );
    expect(count(findings, NET)).toBe(1);
  });

  it('finds a short TS1234 straddling the boundary and does not duplicate it', async () => {
    const findings = await run(line([[1020, 'TS1234']]));
    expect(count(findings, TYPE)).toBe(1);
  });

  it('reports a single match in the window overlap exactly once (no duplicate)', async () => {
    // ECONNRESET at 900 is visible in window 0 and again in window 1024; the
    // forward reach must not double-report it.
    const findings = await run(line([[900, 'ECONNRESET']]));
    expect(count(findings, NET)).toBe(1);
  });

  it('reports three distinct matches on one line, each exactly once', async () => {
    const findings = await run(
      line([
        [100, 'ECONNRESET'],
        [1500, 'ETIMEDOUT'],
        [2500, 'TS9999'],
      ]),
    );
    expect(count(findings, NET)).toBe(2);
    expect(count(findings, TYPE)).toBe(1);
  });
});
