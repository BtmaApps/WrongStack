import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { coreAliases } from '../../scripts/vitest-core-aliases.mjs';
import { getVitestMaxWorkers } from '../../vitest.workers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      ...coreAliases(path.resolve(__dirname, '../core')),
    },
  },
  test: {
    maxWorkers: getVitestMaxWorkers(),
    include: ['tests/**/*.test.ts'],
    setupFiles: ['../../vitest.setup.ts'],
    // Match root, packages/cli and packages/webui-server, which all set 60s.
    // Vitest's 5s default is too tight here: runtime tests make real daemon
    // round-trips and pay cold module-graph transforms. Measured live:
    // wrongtrace-light-subagent-gate.test.ts spends ~1.7s per daemon-backed
    // test, and packages/cli's equivalent single test already measures 5.4s
    // (it survives only because that package raises the limit). The same
    // class of flake previously hit tests/subpath-exports.test.ts.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: [
        // Barrel re-export — no runnable code
        'src/index.ts',
        // Pure interface file — no runnable code
        'src/pack.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 99,
        statements: 99,
        branches: 97,
      },
    },
  },
});
