import { describe, expect, it } from 'vitest';
import { clampTimeoutMs } from '../../src/execution/tool-executor-support.js';

describe('clampTimeoutMs', () => {
  it('caps a configured timeout at the Node timer ceiling', () => {
    // Above 2^31-1 ms Node clamps a timer to 1 ms (every tool call aborted at
    // once), and from 2^32 AbortSignal.timeout throws ERR_OUT_OF_RANGE.
    expect(clampTimeoutMs(3_600_000_000, 3_600_000_000)).toBe(2_147_483_647);
    expect(clampTimeoutMs(5_000_000_000, 5_000_000_000)).toBe(2_147_483_647);
    expect(clampTimeoutMs(2_147_483_647, 2_147_483_647)).toBe(2_147_483_647);
    expect(() => AbortSignal.timeout(clampTimeoutMs(5e9, 5e9))).not.toThrow();
  });

  it('still takes the smaller of the tool and configured maximum', () => {
    expect(clampTimeoutMs(50, 5_000_000_000)).toBe(50);
    expect(clampTimeoutMs(5_000_000_000, 70)).toBe(70);
    expect(clampTimeoutMs(0, 0)).toBe(300_000);
  });
});
