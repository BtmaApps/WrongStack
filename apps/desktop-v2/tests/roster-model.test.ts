import { expect, it } from 'vitest';
import {
  mergeRosterConfig,
  rosterCatalog,
  rosterConfig,
  rosterDocumentKey,
} from '../src/roster-model';

it('keeps large explicit budgets, inherited fields and independently changed settings without silent caps', () => {
  const base = {
    budget: { maxToolCalls: 10_000, timeoutMs: 3_600_000 },
    tools: ['read'],
    modelPolicy: { allowed: [{ provider: 'a', model: 'b' }], strict: true },
  };
  const draft = { ...base, budget: { ...base.budget, maxToolCalls: '250000', timeoutMs: '' } };
  const current = { ...base, cwd: 'packages/app' };
  const merged = mergeRosterConfig(base, draft, current);
  expect(merged).toEqual({ ...current, budget: { maxToolCalls: 250_000 } });
  expect(() =>
    mergeRosterConfig(base, draft, { ...base, budget: { ...base.budget, maxToolCalls: 11 } }),
  ).toThrow('changed elsewhere');
  expect(rosterConfig({ budget: { maxCostUsd: '0.125', maxIterations: 0 } })).toEqual({
    budget: { maxCostUsd: 0.125, maxIterations: 0 },
  });
  expect(() => rosterConfig({ budget: { maxIterations: '2.5' } })).toThrow('whole number');
  expect(() => rosterConfig({ cwd: '../other' })).toThrow('inside');
  expect(() =>
    rosterConfig({
      modelPolicy: {
        allowed: [{ provider: 'a', model: 'b' }],
        fallbacks: [{ provider: 'a', model: 'c' }],
      },
    }),
  ).toThrow('also be allowed');
});
it('joins recorded statistics by role and keeps project/document draft ownership explicit', () => {
  expect(
    rosterCatalog({
      catalog: [
        { role: 'a', tools: 3 },
        { role: 'b', tools: 0 },
      ],
      stats: [
        { role: 'b', entryCount: 8 },
        { role: 'a', entryCount: 1 },
      ],
    }),
  ).toEqual([
    { role: 'a', tools: 3, stats: { role: 'a', entryCount: 1 } },
    { role: 'b', tools: 0, stats: { role: 'b', entryCount: 8 } },
  ]);
  expect(rosterDocumentKey('a', 'reviewer', 'identity')).not.toBe(
    rosterDocumentKey('b', 'reviewer', 'identity'),
  );
  expect(rosterDocumentKey('a', 'reviewer', 'identity')).not.toBe(
    rosterDocumentKey('a', 'reviewer', 'learned'),
  );
});
