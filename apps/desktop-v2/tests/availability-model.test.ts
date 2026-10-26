import type { ModelBlackoutRule } from '@wrongstack/contracts/types/model-availability';
import { describe, expect, it } from 'vitest';
import { evaluateModelCalendar } from '../../../packages/core/src/core/model-availability-calendar';
import { availabilityIssue, scheduleMinute, scheduleSegments } from '../src/availability-model';

const overnight: ModelBlackoutRule = {
  id: 'night',
  provider: 'fixture',
  model: 'test',
  days: [1],
  start: '22:00',
  end: '07:00',
  timezone: 'UTC',
  mode: 'blackout',
};
describe('availability editor contracts', () => {
  it('validates real targets, wall-clock times and IANA zones', () => {
    expect(scheduleMinute('22:30')).toBe(1350);
    expect(availabilityIssue([overnight])).toBeNull();
    expect(availabilityIssue([{ ...overnight, provider: undefined, model: undefined }])).toMatch(
      /target/,
    );
    expect(availabilityIssue([{ ...overnight, start: '24:00' }])).toMatch(/HH:mm/);
    expect(availabilityIssue([{ ...overnight, timezone: 'not/a-zone' }])).toMatch(/timezone/);
    expect(availabilityIssue([overnight, overnight])).toMatch(/unique/);
  });
  it('previews overnight carry and equal-time all-day windows', () => {
    expect(scheduleSegments(overnight, 1)).toEqual([[1320, 1440]]);
    expect(scheduleSegments(overnight, 2)).toEqual([[0, 420]]);
    expect(scheduleSegments(overnight, 3)).toEqual([]);
    expect(scheduleSegments({ ...overnight, start: '08:00', end: '08:00' }, 1)).toEqual([
      [0, 1440],
    ]);
    expect(scheduleSegments({ ...overnight, start: '08:00', end: '08:00' }, 2)).toEqual([]);
  });
  it('matches the canonical engine calendar at interval boundaries', () => {
    for (const rule of [
      overnight,
      { ...overnight, start: '09:00', end: '17:00' },
      { ...overnight, start: '08:00', end: '08:00' },
      { ...overnight, days: [] },
    ]) {
      for (const iso of [
        '2026-10-26T00:00:00Z',
        '2026-10-26T07:00:00Z',
        '2026-10-26T09:00:00Z',
        '2026-10-26T16:59:00Z',
        '2026-10-26T17:00:00Z',
        '2026-10-26T22:00:00Z',
        '2026-10-27T00:00:00Z',
        '2026-10-27T06:59:00Z',
        '2026-10-27T07:00:00Z',
      ]) {
        const at = new Date(iso),
          minute = at.getUTCHours() * 60 + at.getUTCMinutes();
        const inside = scheduleSegments(rule, at.getUTCDay()).some(
          ([start, end]) => minute >= start && minute < end,
        );
        expect(evaluateModelCalendar([rule], 'fixture', 'test', at).allowed).toBe(!inside);
      }
    }
  });
});
