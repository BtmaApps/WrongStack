import { describe, expect, it } from 'vitest';
import { automationMilliseconds } from '../src/automation-units';

// The runtime (`validateJobSpec` / `validateAutomationVerification`) accepts
// only safe-integer milliseconds for the timeout, interval and verification
// timeout the automation form converts from minutes and seconds.
describe('automation form durations', () => {
  it.each([
    ['10', 60_000, 600_000],
    ['4.1', 60_000, 246_000],
    ['8.2', 60_000, 492_000],
    ['16.1', 60_000, 966_000],
    ['1440', 60_000, 86_400_000],
    ['120', 1_000, 120_000],
    ['16.1', 1_000, 16_100],
    ['64.4', 1_000, 64_400],
  ])('converts %s × %i to whole milliseconds', (value, unit, ms) => {
    const converted = automationMilliseconds(value, unit);
    expect(converted).toBe(ms);
    expect(Number.isSafeInteger(converted)).toBe(true);
  });

  it.each(['', 'abc'])('leaves %j invalid for the runtime to refuse', (value) => {
    const converted = automationMilliseconds(value, 60_000);
    expect(converted === 0 || Number.isNaN(converted)).toBe(true);
  });
});
