import type { SageStats } from '@wrongstack/sage';
import { describe, expect, it } from 'vitest';
import { formatSageStats } from '../src/slash-commands/memory-formatters.js';

// The formatter is mocked in memory-slash-coverage.test.ts (that suite tests
// routing), so its output is only checked here and end to end in
// slash-memory-sage.test.ts.
describe('formatSageStats', () => {
  it('renders zero, not "undefined", for statuses a surface omits', () => {
    // A partial byStatus is what the SQLite backend returned before it
    // zero-filled (`GROUP BY` omits empty groups). The formatter must not
    // depend on every surface getting that right.
    const partial = {
      total: 2,
      byStatus: { active: 2 },
      byKind: {},
      edges: 0,
    } as unknown as SageStats;
    const out = formatSageStats(partial);
    expect(out).toContain('Total: 2; active 2; stale 0; archived 0; deleted 0.');
    expect(out).not.toContain('undefined');
  });

  it('renders every count, kinds, and edges from a complete record', () => {
    const stats: SageStats = {
      total: 10,
      byStatus: { active: 4, stale: 3, superseded: 0, contradicted: 0, archived: 2, deleted: 1 },
      byKind: { fact: 6, decision: 4 },
      edges: 7,
    };
    expect(formatSageStats(stats).split('\n')).toEqual([
      '## SAGE Stats',
      'Total: 10; active 4; stale 3; archived 2; deleted 1.',
      'Graph edges: 7.',
      'Kinds: fact=6, decision=4.',
    ]);
  });

  it('says "none" when there are no kinds', () => {
    const empty = { total: 0, byStatus: {}, byKind: {}, edges: 0 } as unknown as SageStats;
    expect(formatSageStats(empty)).toContain('Kinds: none.');
  });

  it('adds the audience line only when a scoped count is given', () => {
    const stats = {
      total: 1,
      byStatus: { active: 1 },
      byKind: {},
      edges: 0,
    } as unknown as SageStats;
    expect(formatSageStats(stats)).not.toContain('Audience-scoped');
    // 0 is a real count, not "absent" — it must still render.
    expect(formatSageStats(stats, 0, '')).toContain('Audience-scoped: 0.');
    expect(formatSageStats(stats, 2, 'reviewer, git')).toContain(
      'Audience-scoped: 2 (reviewer, git).',
    );
  });
});
