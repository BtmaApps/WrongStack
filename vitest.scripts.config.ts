import { defineConfig } from 'vitest/config';
import { getVitestMaxWorkers } from './vitest.workers.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/core/tests/architecture/coverage-matrix-script.test.ts',
      'packages/core/tests/architecture/coverage-runtime.test.ts',
      'packages/core/tests/architecture/architecture-health-script.test.ts',
      'packages/core/tests/architecture/build-lineage-script.test.ts',
      'packages/core/tests/architecture/test-skip-budget-script.test.ts',
      'packages/core/tests/architecture/script-entrypoints.test.ts',
      'packages/core/tests/architecture/check-dep-path-separators.test.ts',
      'packages/core/tests/architecture/check-audit-suppressions.test.ts',
    ],
    maxWorkers: getVitestMaxWorkers(),
    // Every file in the include list above drives a repo script through real
    // child processes — the freshness gate alone spawns ~6 `git` invocations
    // per case (init/config×3/add/commit) in a fresh temp repo. Vitest's
    // built-in default is 5s, and this config never overrode it, so these
    // scripts ran under the TIGHTEST timeout in the repo while the root config
    // (vitest.config.ts) sets 60s with a comment explaining that 5s flakes
    // under load for exactly this class of test. It showed: the 2026-09-18
    // release:check lost 8 freshness-gate cases to `Test timed out in 5000ms`,
    // all green in isolation.
    //
    // The collateral damage is worth knowing, because it reads like a
    // different bug: a Vitest timeout does NOT stop the test body, so the
    // orphaned body kept spawning git while `afterEach` deleted its temp dir —
    // producing `fatal: not a git repository` and `ENOTEMPTY ... rmdir` on top
    // of the timeout. Those were symptoms of the tight budget, not of the gate.
    //
    // Match the root config rather than inventing a second number: the
    // ceiling only matters for a genuinely hung script.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'coverage/scripts',
      include: [
        'scripts/coverage-lock.mjs',
        'scripts/check-zero-coverage.mjs',
        'scripts/coverage-matrix.mjs',
        'scripts/test-coverage.mjs',
        'scripts/lib/architecture-health.mjs',
        'scripts/lib/build-lineage.mjs',
        'scripts/lib/test-inventory.mjs',
        'scripts/lib/test-skip-budget.mjs',
        'vitest.workers.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
        perFile: true,
      },
    },
  },
});
