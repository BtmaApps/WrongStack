import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVitestMaxWorkers } from '../../../../vitest.workers.js';

describe('Vitest worker CLI spellings', () => {
  beforeEach(() => vi.stubEnv('WRONGSTACK_VITEST_MAX_WORKERS', undefined));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [['-w=false'], 4],
    [['--watch=false'], 4],
    [['-w'], 2],
    [['-w=true'], 2],
  ])('maps %s to %s workers', (argv, expected) => {
    expect(getVitestMaxWorkers(argv)).toBe(expected);
  });

  it('lets the explicit worker override win for the short watch-disable alias', () => {
    vi.stubEnv('WRONGSTACK_VITEST_MAX_WORKERS', '8');
    expect(getVitestMaxWorkers(['-w=false'])).toBe(8);
  });
});
