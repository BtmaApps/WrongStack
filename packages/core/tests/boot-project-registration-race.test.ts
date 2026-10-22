import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Actor A's read-modify-write read waits until actor B has read too — unless A
// holds the manifest lock, in which case B cannot read before A has written.
const g = vi.hoisted(() => ({
  actor: undefined as undefined | import('node:async_hooks').AsyncLocalStorage<string>,
  gated: false,
  reads: new Map<string, number>(),
  bRead: undefined as undefined | (() => void),
  bReadDone: undefined as undefined | Promise<void>,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = (async (...args: Parameters<typeof real.readFile>) => {
    const file = String(args[0]);
    const who = g.actor?.getStore();
    if (!g.gated || !who || !file.endsWith('projects.json')) return real.readFile(...args);
    const n = (g.reads.get(who) ?? 0) + 1;
    g.reads.set(who, n);
    if (n === 2 && who === 'A' && !existsSync(join(file, '..', '.projects.json.lock'))) {
      await g.bReadDone;
    }
    const out = await real.readFile(...args);
    if (n === 2 && who === 'B') g.bRead?.();
    return out;
  }) as typeof real.readFile;
  return { ...real, readFile, default: { ...real, readFile } };
});

const { registerProjectInManifest } = await import('../src/boot-project-registration.js');
const { resolveWstackPaths } = await import('../src/utils/wstack-paths.js');

describe('registerProjectInManifest under concurrent boots', () => {
  it('keeps both projects when two sessions boot at once', async () => {
    g.actor = new AsyncLocalStorage<string>();
    const globalRoot = join(mkdtempSync(join(tmpdir(), 'wstack-reg-race-')), '.wrongstack');
    const rootA = mkdtempSync(join(tmpdir(), 'wstack-reg-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'wstack-reg-b-'));
    const pathsA = resolveWstackPaths({ projectRoot: rootA, globalRoot });
    const pathsB = resolveWstackPaths({ projectRoot: rootB, globalRoot });
    await registerProjectInManifest(pathsA, rootA);

    g.reads.clear();
    g.bReadDone = new Promise<void>((resolve) => {
      g.bRead = resolve;
    });
    g.gated = true;
    try {
      await Promise.all([
        g.actor.run('A', () => registerProjectInManifest(pathsA, rootA)),
        g.actor.run('B', () => registerProjectInManifest(pathsB, rootB)),
      ]);
    } finally {
      g.gated = false;
    }

    const roots = (
      JSON.parse(readFileSync(join(globalRoot, 'projects.json'), 'utf8')) as {
        projects: Array<{ root: string }>;
      }
    ).projects.map((p) => p.root);
    expect(roots).toContain(rootA);
    expect(roots).toContain(rootB);
  });
});
