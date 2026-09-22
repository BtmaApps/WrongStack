import { describe, expect, it } from 'vitest';
import { cvssBaseScore } from '../../src/advisory/cvss.js';

describe('cvssBaseScore', () => {
  it('computes CVSS:3.1 base scores for well-known vectors', () => {
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N')).toBe(6.5);
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')).toBe(0);
  });

  it('computes the captured log4shell vector (scope changed, temporal ignored) to 10', () => {
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H/E:H')).toBe(10);
  });

  it('computes CVSS:2.0 base scores and clamps to the 0..10 range', () => {
    expect(cvssBaseScore('CVSS_V2', 'CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:C/A:C')).toBe(10);
  });

  it('returns undefined for malformed vectors and unknown types', () => {
    expect(cvssBaseScore('CVSS_V3', 'not-a-vector')).toBeUndefined();
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L')).toBeUndefined();
    expect(cvssBaseScore('CVSS_V4', 'CVSS:4.0/AV:N')).toBeUndefined();
  });
});
