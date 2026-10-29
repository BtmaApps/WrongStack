import { describe, expect, it } from 'vitest';
import { rosterInputCodec, rosterInputsToKeep } from '../src/roster-input-draft';

describe('roster unsent inputs', () => {
  it('keeps only roles with typed text and only text fields', () => {
    expect(
      rosterInputsToKeep({
        reviewer: { teach: 'Prefer focused tests', improve: '', instruction: '' },
        executor: { teach: ' ', improve: '', instruction: '' },
      }),
    ).toEqual({
      reviewer: { teach: 'Prefer focused tests', improve: '', instruction: '', capture: '' },
    });
    expect(rosterInputsToKeep({ executor: { teach: '' } })).toBeNull();
  });
  it('refuses unsupported envelopes', () => {
    const row = { teach: 'x', improve: '', instruction: '', capture: '' };
    expect(rosterInputCodec.parse({ version: 1, inputs: { reviewer: row } })).toEqual({
      reviewer: row,
    });
    for (const inputs of [
      [],
      { reviewer: { ...row, extra: 'x' } },
      { reviewer: { ...row, teach: 7 } },
      JSON.parse('{"__proto__":{"teach":"x","improve":"","instruction":"","capture":""}}'),
      { reviewer: { ...row, teach: 'x'.repeat(100_001) } },
    ])
      expect(() => rosterInputCodec.parse({ version: 1, inputs })).toThrow(/unsupported format/);
  });
});
