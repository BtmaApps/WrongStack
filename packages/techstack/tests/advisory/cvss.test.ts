import { describe, expect, it } from 'vitest';
import { cvssBaseScore } from '../../src/advisory/cvss.js';

describe('cvssBaseScore', () => {
  it('computes CVSS:3.1 base scores for well-known vectors', () => {
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N')).toBe(6.5);
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')).toBe(0);
  });

  it('applies the changed-scope multiplier before rounding or capping', () => {
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')).toBe(6.1);
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H/E:H')).toBe(10);
  });

  it('computes CVSS:2.0 base scores and clamps to the 0..10 range', () => {
    expect(cvssBaseScore('CVSS_V2', 'CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:C/A:C')).toBe(10);
  });

  /**
   * FIRST §3.1 base equation:
   *   BaseScore = round_to_1_decimal(((0.6*Impact)+(0.4*Exploitability)-1.5)*f(Impact))
   *
   * 1.5 is the equation's additive constant and is NOT the f(Impact) multiplier
   * (1.176). Conflating the two inflated every non-zero-impact v2 score by
   * ~0.4, which crosses the published severity bands. The clamp case above
   * cannot catch it: its spec score is 9.9951, so both constants return 10.
   *
   * Published FIRST/NVD base scores; `AV:A` is excluded because the Adjacent
   * weight in `AV2` is a separate, still-open deviation from §3.2 (0.647).
   */
  it.each([
    ['CVSS:2.0/AV:N/AC:L/Au:N/C:P/I:P/A:P', 7.5],
    ['CVSS:2.0/AV:L/AC:H/Au:M/C:C/I:C/A:C', 5.9],
    ['CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:N/A:N', 7.8],
    ['CVSS:2.0/AV:N/AC:L/Au:N/C:N/I:N/A:N', 0],
  ])('follows the FIRST §3.1 base equation for %s', (vector, expected) => {
    expect(cvssBaseScore('CVSS_V2', vector)).toBe(expected);
  });

  /**
   * FIRST §3.2 AccessVector: local 0.395, **adjacent network 0.646**, network 1.0.
   * The Adjacent weight was 0.647, which pushed every AV:A base score one 0.1
   * step high (the spec 7.1 reported as 7.2) — invisible in the AV:N cases above.
   */
  it.each([
    ['CVSS:2.0/AV:A/AC:H/Au:M/C:C/I:C/A:C', 6.2],
    ['CVSS:2.0/AV:A/AC:L/Au:S/C:N/I:C/A:C', 7.1],
    ['CVSS:2.0/AV:A/AC:L/Au:S/C:C/I:N/A:C', 7.1],
    ['CVSS:2.0/AV:A/AC:L/Au:S/C:C/I:C/A:N', 7.1],
    // Control: AV:A at zero impact is unaffected (f(Impact) = 0).
    ['CVSS:2.0/AV:A/AC:L/Au:N/C:N/I:N/A:N', 0],
  ])('applies the FIRST §3.2 Adjacent weight to %s', (vector, expected) => {
    expect(cvssBaseScore('CVSS_V2', vector)).toBe(expected);
  });

  it('returns undefined for malformed vectors and unknown types', () => {
    expect(cvssBaseScore('CVSS_V3', 'not-a-vector')).toBeUndefined();
    expect(cvssBaseScore('CVSS_V3', 'CVSS:3.1/AV:N/AC:L')).toBeUndefined();
    expect(cvssBaseScore('CVSS_V4', 'CVSS:4.0/AV:N')).toBeUndefined();
  });
});
