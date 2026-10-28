import { expect, it } from 'vitest';
import { effectSummary, effectsCsv, effectsSnapshot } from '../src/side-effects-model';

const effect = {
  toolUseId: 'call-1',
  toolName: 'bash',
  ts: '2026-10-28T00:00:00Z',
  input: { command: 'git status' },
  risk: 'shell' as const,
  outcome: 'exit 0',
};
it('preserves the owning runtime window and refuses malformed or mismatched records', () => {
  expect(
    effectsSnapshot({ sessionId: 'one', sideEffects: [effect], total: 70, truncated: true }, 'one'),
  ).toMatchObject({ total: 70, truncated: true, entries: [effect] });
  expect(effectsSnapshot({ sessionId: 'one', sideEffects: [effect] }, 'one').total).toBeNull();
  expect(() => effectsSnapshot({ sessionId: 'other', sideEffects: [effect] }, 'one')).toThrow(
    'another',
  );
  expect(() =>
    effectsSnapshot({ sessionId: 'one', sideEffects: [{ ...effect, ts: 'bad' }] }, 'one'),
  ).toThrow('invalid');
  expect(() =>
    effectsSnapshot({ sessionId: 'one', sideEffects: [effect], total: 0 }, 'one'),
  ).toThrow('inconsistent');
});
it('summarizes meaningful inputs without dumping arbitrary JSON and escapes spreadsheet formulas', () => {
  expect(effectSummary(effect)).toBe('git status');
  expect(effectSummary({ ...effect, input: { packages: ['one', 'two'] } })).toBe('one, two');
  expect(effectSummary({ ...effect, input: { custom: { nested: true } } })).toBe(
    '1 recorded input fields',
  );
  const csv = effectsCsv([
    {
      ...effect,
      input: { command: '=HYPERLINK("https://fixture.invalid")\nnext' },
      outcome: '+untrusted',
    },
  ]);
  expect(csv).toContain('"\'=HYPERLINK(""https://fixture.invalid"")\nnext"');
  expect(csv).toContain('"\'+untrusted"');
});
