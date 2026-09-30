import { describe, expect, it } from 'vitest';
import { hasCompetingVitestRun } from '../../../../vitest.globalTeardown.js';

describe('Vitest daemon cleanup concurrency guard', () => {
  it('preserves daemons while another Vitest coordinator is active', () => {
    expect(
      hasCompetingVitestRun(
        [{ pid: 200, commandLine: 'node "D:\\repo\\node_modules\\vitest\\vitest.mjs" run' }],
        100,
      ),
    ).toBe(true);
    expect(
      hasCompetingVitestRun(
        [{ pid: 200, commandLine: 'node /repo/node_modules/vitest/vitest.mjs run --coverage' }],
        100,
      ),
    ).toBe(true);
  });

  it('allows cleanup when only the current coordinator and its workers remain', () => {
    expect(
      hasCompetingVitestRun(
        [
          { pid: 100, commandLine: 'node /repo/node_modules/vitest/vitest.mjs run' },
          { pid: 200, commandLine: 'node /repo/node_modules/vitest/dist/workers/forks.js' },
          { pid: 300, commandLine: 'node /repo/packages/sage/dist/project-server.js' },
        ],
        100,
      ),
    ).toBe(false);
  });
});
