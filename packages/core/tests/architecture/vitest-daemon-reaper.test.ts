import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasCompetingVitestRun, isTempRooted } from '../../../../vitest.globalTeardown.js';

describe('Vitest daemon cleanup concurrency guard', () => {
  it('recognizes Bun coordinators launched through the package runner', () => {
    for (const commandLine of [
      'bun --bun run vitest run',
      '"C:\\Program Files\\Bun\\bun.exe" --bun run vitest run --coverage',
      '/usr/local/bin/bun run vitest run',
    ]) {
      expect(hasCompetingVitestRun([{ pid: 200, commandLine }], 100), commandLine).toBe(true);
    }
  });

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
          { pid: 400, commandLine: 'bun /repo/node_modules/vitest/dist/workers/forks.js' },
          { pid: 500, commandLine: 'bun /repo/packages/sage/dist/project-server.js' },
        ],
        100,
      ),
    ).toBe(false);
  });

  it('allows cleanup for its own Bun package runner', () => {
    expect(
      hasCompetingVitestRun([{ pid: 100, commandLine: 'bun --bun run vitest run' }], 100),
    ).toBe(false);
  });

  it('reaps temp-rooted test daemons but spares a live bench sandbox', () => {
    const daemon = (root: string) =>
      `node packages/kanban/dist/project-server.js --project-root "${root}"`;
    const tmp = os.tmpdir();
    expect(isTempRooted(daemon(path.join(tmp, 'kanban-test-abc')))).toBe(true);
    expect(isTempRooted(daemon(path.join(tmp, 'wstack-bench-Xy12', 'work', 'cell__task')))).toBe(
      false,
    );
    expect(isTempRooted(daemon(path.join(path.parse(tmp).root, 'repo')))).toBe(false);
  });
});
