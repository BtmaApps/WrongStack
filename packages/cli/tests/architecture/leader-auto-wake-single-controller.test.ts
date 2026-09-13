/**
 * One background-delegation auto-wake controller per process.
 *
 * `LeaderAutoWakeController` subscribes to the process-wide delivery hub. Two
 * controllers in one process would both see every `leader.delivery_pending`
 * and both start a leader turn: a double wake. The CLI owns the controller —
 * it owns the delegate tool and the hub — and constructs it once per
 * execution branch (TUI, WebUI), which are mutually exclusive. The WebUI
 * server package only BINDS a port to the controller it is handed; it must
 * never construct one of its own.
 *
 * Walks the source, so a new construction site cannot be added silently.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PACKAGES = path.join(repositoryRoot, 'packages');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'tests', 'coverage']);
const CONSTRUCT = /new\s+LeaderAutoWakeController\s*\(/g;

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      yield path.join(dir, entry.name);
    }
  }
}

async function constructionSites(): Promise<Map<string, number>> {
  const sites = new Map<string, number>();
  for (const pkg of ['cli', 'tui', 'webui-server', 'acp', 'runtime']) {
    for await (const file of walk(path.join(PACKAGES, pkg, 'src'))) {
      const source = await fs.readFile(file, 'utf8');
      const count = source.match(CONSTRUCT)?.length ?? 0;
      if (count > 0) sites.set(path.relative(PACKAGES, file).replace(/\\/g, '/'), count);
    }
  }
  return sites;
}

describe('leader auto-wake controller ownership', () => {
  it('is constructed only by the CLI execution branches, once each', async () => {
    const sites = await constructionSites();
    expect(Object.fromEntries(sites)).toEqual({ 'cli/src/execution.ts': 2 });
  });

  it('constructs one controller in the TUI branch and one in the exclusive WebUI branch', async () => {
    const source = await fs.readFile(path.join(PACKAGES, 'cli/src/execution.ts'), 'utf8');
    const webuiBranch = source.indexOf("} else if (executionMode === 'webui') {");
    expect(webuiBranch).toBeGreaterThan(0);
    const constructions = [...source.matchAll(CONSTRUCT)].map((m) => m.index ?? -1);
    expect(constructions).toHaveLength(2);
    expect(constructions[0]).toBeLessThan(webuiBranch);
    expect(constructions[1]).toBeGreaterThan(webuiBranch);
    // Both are disposed when their branch ends.
    expect(source).toContain('leaderAutoWake.dispose()');
    expect(source).toContain('webuiLeaderAutoWake.dispose()');
  });

  it('the WebUI server binds the controller it is handed', async () => {
    const host = await fs.readFile(
      path.join(PACKAGES, 'webui-server/src/server/leader-auto-wake-host.ts'),
      'utf8',
    );
    expect(host).toContain('opts.controller.attachPort(');
    const cliHost = await fs.readFile(path.join(PACKAGES, 'cli/src/webui-server.ts'), 'utf8');
    expect(cliHost).toContain('controller: opts.leaderAutoWake');
  });
});
