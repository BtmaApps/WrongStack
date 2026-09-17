import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, telegramConfigSchema } from '../../src/config.js';

/**
 * Schema-description defaults must agree with the applied defaults.
 *
 * Round r15 found `rateLimitBurst` documented as "(default: 1)" while
 * `DEFAULT_CONFIG.rateLimitBurst` is 4 (and index.ts's hot-reload coercions
 * encoded the same wrong `?? 1` fallback). This generalized guard walks
 * every numeric default and fails on any future drift between the
 * user-facing schema text and the value the plugin actually applies.
 *
 * Only numeric defaults are checked: the parser reads the "default: N" /
 * "default N" clause out of each field's description, and fields that
 * document no default are skipped (nothing to drift).
 */
describe('telegram config schema descriptions match DEFAULT_CONFIG', () => {
  it('every documented numeric "default: N" equals the applied default', () => {
    const properties = telegramConfigSchema.properties as Record<
      string,
      { description?: string } | undefined
    >;

    const mismatches: string[] = [];
    for (const [key, applied] of Object.entries(DEFAULT_CONFIG)) {
      if (typeof applied !== 'number') continue;
      const description = properties[key]?.description ?? '';
      const match = /default:?\s*(-?[\d.]+)/.exec(description);
      if (match === null) continue;
      const documented = Number.parseFloat(match[1] ?? '');
      if (documented !== applied) {
        mismatches.push(
          `${key}: description says "default: ${match[1]}" but DEFAULT_CONFIG applies ${applied}`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('rateLimitBurst applies the documented burst of 4', () => {
    // The r15 defect, pinned directly: docs (rate-limiter.ts, bot-queue.ts),
    // DEFAULT_CONFIG, and the schema description must all say 4.
    expect(DEFAULT_CONFIG.rateLimitBurst).toBe(4);
    const description = (
      telegramConfigSchema.properties as Record<string, { description?: string }>
    ).rateLimitBurst?.description;
    expect(description).toContain('default: 4');
  });
});
