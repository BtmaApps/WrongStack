import { describe, expect, it } from 'vitest';
import { fleetPolicyIssue } from '../src/fleet-policy-model';
import { prepareSettingsPatch } from '../src/settings-save-model';

describe('Fleet profile policy', () => {
  it('accepts uncapped positive whole concurrency and explicit policy values', () => {
    expect(
      fleetPolicyIssue({
        maxConcurrent: 128,
        fleetChatVerbosity: 'full',
        memoryCompanionEnabled: false,
      }),
    ).toBe('');
    for (const value of [0, -1, 1.5, NaN, Infinity, '4', undefined, Number.MAX_SAFE_INTEGER + 1])
      expect(fleetPolicyIssue({ maxConcurrent: value })).toContain('positive whole number');
    expect(fleetPolicyIssue({ fleetChatVerbosity: 'partial' })).toContain('quiet or detailed');
    expect(fleetPolicyIssue({ exploreCompanionEnabled: 'false' })).toContain('explicit');
  });
  it('writes only edited switches and refuses a concurrent same-field edit', () => {
    const base = { maxConcurrent: 8, memoryCompanionEnabled: true, nextPrediction: true };
    const draft = { ...base, memoryCompanionEnabled: false };
    expect(prepareSettingsPatch(base, draft, { ...base, maxConcurrent: 32 })).toEqual({
      memoryCompanionEnabled: false,
    });
    expect(() =>
      prepareSettingsPatch(base, { ...base, maxConcurrent: 24 }, { ...base, maxConcurrent: 16 }),
    ).toThrow(/changed elsewhere/);
    expect(fleetPolicyIssue({ contextMode: 'deep' })).toBe('');
  });
});
