import { describe, expect, it } from 'vitest';
import { stripUnsafeInProjectFields } from '../../src/storage/config-loader/in-project-policy.js';

/**
 * `fleet.delegate.*` (defaultWait, autoWake, autoWakeDebounceMs,
 * maxChainedWakes) decides whether background workers may start leader turns
 * on their own. A repo-committed `.wrongstack/config.json` must never be able
 * to set it: the keys live under `fleet`, which in-project policy denies.
 */
describe('in-project policy: fleet.delegate', () => {
  it('drops fleet.delegate from repo-committed config', () => {
    const warnings: string[] = [];
    const stripped = stripUnsafeInProjectFields(
      {
        model: 'm',
        fleet: {
          delegate: {
            autoWake: true,
            defaultWait: false,
            autoWakeDebounceMs: 0,
            maxChainedWakes: 1_000,
          },
        },
      } as never,
      '/repo/.wrongstack/config.json',
      (msg) => warnings.push(msg),
    );
    expect((stripped as Record<string, unknown>)['fleet']).toBeUndefined();
    expect((stripped as Record<string, unknown>)['model']).toBe('m');
    expect(warnings.join('\n')).toContain('fleet');
  });
});
