/**
 * Regression (bug-hunt r9-20261029-manifest-identity): registerProjectInManifest
 * matched existing entries by raw root text, while boot passes the canonical
 * identity root (canonicalProjectRoot — what projectSlug is derived from). One
 * repository registered through a linked git worktree (or a differently-cased
 * Windows spelling) was therefore duplicated under the same slug on every boot
 * instead of being refreshed.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerProjectInManifest } from '../src/boot-project-registration.js';
import type { WstackPaths } from '../src/utils/wstack-paths.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-projects-identity-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Real repo with one commit and a real linked worktree beside it. */
async function makeRepoWithWorktree(): Promise<{ main: string; wt: string }> {
  const main = path.join(dir, 'repo-main');
  await fs.mkdir(main);
  git(main, 'init', '-q');
  git(main, 'config', 'user.email', 't@t.dev');
  git(main, 'config', 'user.name', 'T');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
  const wt = path.join(dir, 'repo-wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'feature');
  return { main, wt };
}

function pathsFor(projectSlug: string): WstackPaths {
  return { globalRoot: dir, projectSlug } as unknown as WstackPaths;
}

async function manifestRoots(): Promise<string[]> {
  const raw = await fs.readFile(path.join(dir, 'projects.json'), 'utf8');
  const manifest = JSON.parse(raw.replace(/^﻿/, '')) as { projects: Array<{ root: string }> };
  return manifest.projects.map((project) => project.root);
}

describe('registerProjectInManifest identity', () => {
  it('refreshes a worktree-spelled entry instead of duplicating it', async () => {
    const { canonicalProjectRoot } = await import('../src/utils/wstack-paths.js');
    const { main, wt } = await makeRepoWithWorktree();

    // The CLI registered the worktree spelling (as /project add would).
    await registerProjectInManifest(pathsFor('repo-main-hash'), wt);
    expect(await manifestRoots()).toEqual([wt]);

    // Boot from the main checkout passes the canonical identity root.
    await registerProjectInManifest(pathsFor('repo-main-hash'), canonicalProjectRoot(main));
    expect(await manifestRoots(), 'the same repository must stay one entry').toEqual([wt]);
  });

  it.skipIf(process.platform !== 'win32')(
    'refreshes a differently-cased spelling instead of duplicating it',
    async () => {
      const { canonicalProjectRoot } = await import('../src/utils/wstack-paths.js');
      const main = path.join(dir, 'repo-main');
      await fs.mkdir(main);
      const lowerSpelling = `${main.at(0)?.toLowerCase()}${main.slice(1)}`;

      // Registered with a lowercase drive letter; boot arrives canonicalized.
      await registerProjectInManifest(pathsFor('repo-main-hash'), lowerSpelling);
      await registerProjectInManifest(pathsFor('repo-main-hash'), canonicalProjectRoot(main));
      expect(await manifestRoots(), 'a drive-letter case difference is the same directory').toEqual(
        [lowerSpelling],
      );
    },
  );

  it('keeps registering the same canonical root as one entry', async () => {
    const { canonicalProjectRoot } = await import('../src/utils/wstack-paths.js');
    const main = path.join(dir, 'repo-main');
    await fs.mkdir(main);
    const wpaths = pathsFor('repo-main-hash');

    await registerProjectInManifest(wpaths, canonicalProjectRoot(main));
    await registerProjectInManifest(wpaths, canonicalProjectRoot(main));
    expect(await manifestRoots()).toEqual([canonicalProjectRoot(main)]);
  });
});
