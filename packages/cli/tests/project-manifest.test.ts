/**
 * Focused coverage for services/project-manifest.ts — the shared
 * projects.json manifest persistence: slug generation, lookup, load/save,
 * data-dir creation, and the idempotent touchProjectInManifest flow.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  withFileLock: vi.fn(),
  readProjectIdentity: vi.fn(),
}));

vi.mock('@wrongstack/core/utils', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    withFileLock: h.withFileLock,
    readProjectIdentity: h.readProjectIdentity,
  };
});

import {
  ensureProjectDataDir,
  findProject,
  generateSlug,
  loadManifest,
  type ProjectsManifest,
  saveManifest,
  touchProjectInManifest,
} from '../src/services/project-manifest.js';

let dir: string;
/** globalConfigPath is treated as a file path; its dirname is the base dir. */
let cfgPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-project-manifest-'));
  cfgPath = path.join(dir, 'config.json');
  h.withFileLock.mockReset();
  h.withFileLock.mockImplementation(async (_file, fn: () => Promise<void>) => {
    await fn();
  });
  h.readProjectIdentity.mockReset();
  h.readProjectIdentity.mockResolvedValue(undefined);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('generateSlug', () => {
  it('lowercases, hyphenates, truncates to 40 chars, and appends a hash', () => {
    const slug = generateSlug('/some/My Cool Project');
    expect(slug.startsWith('my-cool-project-')).toBe(true);
    expect(slug.length).toBeGreaterThan('my-cool-project'.length);
    // Deterministic for the same root.
    expect(generateSlug('/some/My Cool Project')).toBe(slug);
  });

  it('falls back to "project" for a root with no basename characters', () => {
    const slug = generateSlug('///---');
    expect(slug.startsWith('project-')).toBe(true);
  });

  it('names the same data directory boot keys the project under', async () => {
    // The manifest slug used to be a local re-derivation of projectSlug that
    // drifted from it, so /project add, /project switch and registration
    // recorded a ~/.wrongstack/projects/<slug> directory nothing else used.
    const { projectSlug } = await import('@wrongstack/core/utils');
    const plain = path.join(dir, 'plain-project');
    await fs.mkdir(plain);
    expect(generateSlug(plain)).toBe(projectSlug(plain));

    // A 40-char cut that ends on a separator keeps no trailing hyphen.
    const long = path.join(dir, `${'a'.repeat(39)}-tail`);
    await fs.mkdir(long);
    expect(generateSlug(long)).toBe(projectSlug(long));
    expect(generateSlug(long)).not.toContain('--');
  });

  it('gives a linked Git worktree its main checkout identity', async () => {
    const { execFileSync } = await import('node:child_process');
    const git = (cwd: string, args: string[]) =>
      execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const main = path.join(dir, 'main-repo');
    await fs.mkdir(main);
    git(main, ['init', '-q']);
    git(main, ['config', 'user.email', 't@t.dev']);
    git(main, ['config', 'user.name', 'T']);
    git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
    const worktree = path.join(dir, 'feature-wt');
    git(main, ['worktree', 'add', '-q', worktree]);

    expect(generateSlug(worktree)).toBe(generateSlug(main));
    const entry = await touchProjectInManifest({
      projectRoot: worktree,
      globalConfigPath: cfgPath,
    });
    expect(entry.slug).toBe(generateSlug(main));
    // The registered root itself stays the checkout the user opened.
    expect(entry.root).toBe(worktree);
  });
});

describe('loadManifest / saveManifest', () => {
  it('returns an empty manifest only when the file is missing', async () => {
    await expect(loadManifest(cfgPath)).resolves.toEqual({ projects: [] });
  });

  it('rejects corrupt or structurally invalid manifests instead of treating them as empty', async () => {
    const { ConfigError } = await import('@wrongstack/contracts/types');
    await fs.writeFile(path.join(dir, 'projects.json'), '{ not json');
    await expect(loadManifest(cfgPath)).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_PARSE_FAILED',
    } satisfies Partial<InstanceType<typeof ConfigError>>);

    await fs.writeFile(path.join(dir, 'projects.json'), JSON.stringify({ projects: undefined }));
    await expect(loadManifest(cfgPath)).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_PARSE_FAILED',
    } satisfies Partial<InstanceType<typeof ConfigError>>);

    await fs.writeFile(
      path.join(dir, 'projects.json'),
      JSON.stringify({ projects: [{ name: 'Broken', root: 42, slug: 'broken' }] }),
    );
    await expect(loadManifest(cfgPath)).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_PARSE_FAILED',
    } satisfies Partial<InstanceType<typeof ConfigError>>);
  });

  it('round-trips a manifest', async () => {
    const manifest: ProjectsManifest = { projects: [{ name: 'A', root: '/a', slug: 'a' }] };
    await saveManifest(manifest, cfgPath);
    await expect(loadManifest(cfgPath)).resolves.toEqual(manifest);
  });

  it('falls back to wstackGlobalRoot() when no config path is given', async () => {
    // projectsJsonPath/projectsDataDir use wstackGlobalRoot() when
    // globalConfigPath is undefined (lines 33-38). With the hermetic
    // WRONGSTACK_HOME setup these resolve to the test home, not the user's.
    const manifest = await loadManifest();
    expect(Array.isArray(manifest.projects)).toBe(true);
    await expect(ensureProjectDataDir('default-slug')).resolves.toContain('projects');
  });
});

describe('findProject', () => {
  const manifest: ProjectsManifest = {
    projects: [
      { name: 'Alpha', root: '/repo/alpha', slug: 'alpha-a1b2c3' },
      { name: 'Beta', root: '/repo/beta', slug: 'beta-d4e5f6' },
    ],
  };

  it('matches by slug, name, root-endswith, and root-contains (case-insensitive)', () => {
    expect(findProject(manifest, 'ALPHA-A1B2C3')?.name).toBe('Alpha');
    expect(findProject(manifest, 'beta')?.name).toBe('Beta');
    expect(findProject(manifest, 'repo/beta')?.name).toBe('Beta');
    expect(findProject(manifest, 'alpha')?.name).toBe('Alpha'); // contains
    expect(findProject(manifest, 'gamma')).toBeUndefined();
  });
});

describe('ensureProjectDataDir', () => {
  it('creates the per-project directory under the config base', async () => {
    const dataDir = await ensureProjectDataDir('my-slug', cfgPath);
    expect(dataDir).toBe(path.join(dir, 'projects', 'my-slug'));
    const stat = await fs.stat(dataDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('touchProjectInManifest', () => {
  it('creates a new entry (defaulting name to basename) and refreshes on touch', async () => {
    const projectRoot = path.join(dir, 'work');
    await fs.mkdir(projectRoot, { recursive: true });

    // No explicit name → basename fallback (line 147 false side).
    const first = await touchProjectInManifest({
      projectRoot,
      globalConfigPath: cfgPath,
      workingDir: path.join(projectRoot, 'nested'),
    });
    expect(first.name).toBe('work');
    expect(first.root).toBe(projectRoot);
    expect(first.lastSeen).toBeDefined();
    expect(first.lastWorkingDir).toBe(path.join(projectRoot, 'nested'));

    // A second touch reuses the entry and refreshes lastSeen.
    const second = await touchProjectInManifest({ projectRoot, globalConfigPath: cfgPath });
    expect(second.name).toBe('work');
    expect(second.createdAt).toBe(first.createdAt);

    const manifest = await loadManifest(cfgPath);
    expect(manifest.projects).toHaveLength(1);
    expect(manifest.projects[0]!.slug).toBe(first.slug);
  });

  it('throws a ConfigError when the lock callback never resolves an entry', async () => {
    // A withFileLock that skips the callback means `entry` stays undefined —
    // the defensive expectEntry throw at line 165 fires.
    h.withFileLock.mockImplementation(async () => undefined);
    const { ConfigError } = await import('@wrongstack/contracts/types');
    await expect(
      touchProjectInManifest({ projectRoot: path.join(dir, 'x'), globalConfigPath: cfgPath }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('adopts projectId and refreshes lastWorkingDir on an existing entry', async () => {
    const projectRoot = path.join(dir, 'identity-work');
    await fs.mkdir(projectRoot, { recursive: true });
    // A committed project identity makes readProjectIdentity resolve on every
    // touch, exercising the `if (projectId)` update at line 143 for both the
    // created and the refreshed entry.
    h.readProjectIdentity.mockResolvedValue({
      version: 1,
      projectId: 'proj_01J1ABC2DEF3GHIJKLMNOPQRST',
    });

    await touchProjectInManifest({ projectRoot, globalConfigPath: cfgPath, name: 'Ident' });
    const second = await touchProjectInManifest({
      projectRoot,
      globalConfigPath: cfgPath,
      workingDir: path.join(projectRoot, 'sub'),
    });
    expect(second.projectId).toBe('proj_01J1ABC2DEF3GHIJKLMNOPQRST');
    expect(second.lastWorkingDir).toBe(path.join(projectRoot, 'sub'));
    expect(second.lastSeen).toBeDefined();

    const manifest = await loadManifest(cfgPath);
    expect(manifest.projects).toHaveLength(1);
    expect(manifest.projects[0]!.projectId).toBe('proj_01J1ABC2DEF3GHIJKLMNOPQRST');
  });

  // Regression (bug-hunt r9-20261029-manifest-identity): entry identity is the
  // canonical project root, not raw text. Boot registers the canonical root,
  // so the same repository reached through a linked worktree or a
  // differently-cased spelling must refresh the entry, not duplicate it under
  // the same slug.
  describe('canonical identity (one repository, one entry)', () => {
    async function makeRepoWithWorktree(prefix: string): Promise<{ main: string; wt: string }> {
      const { execFileSync } = await import('node:child_process');
      const git = (cwd: string, args: string[]) =>
        execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      const main = path.join(dir, `${prefix}-main`);
      await fs.mkdir(main);
      git(main, ['init', '-q']);
      git(main, ['config', 'user.email', 't@t.dev']);
      git(main, ['config', 'user.name', 'T']);
      git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
      const wt = path.join(dir, `${prefix}-wt`);
      git(main, ['worktree', 'add', '-q', wt]);
      return { main, wt };
    }

    it('refreshes a boot-registered canonical entry instead of duplicating it via a worktree', async () => {
      const { canonicalProjectRoot } = await import('@wrongstack/core/utils');
      const { main, wt } = await makeRepoWithWorktree('canon-first');

      // Boot registered the canonical identity root…
      await touchProjectInManifest({
        projectRoot: canonicalProjectRoot(main),
        globalConfigPath: cfgPath,
      });
      // …then the CLI touches the same repository through the worktree.
      await touchProjectInManifest({ projectRoot: wt, globalConfigPath: cfgPath });

      const manifest = await loadManifest(cfgPath);
      expect(manifest.projects, 'one repository, one entry').toHaveLength(1);
      expect(manifest.projects[0]!.root).toBe(canonicalProjectRoot(main));
    });

    it('refreshes a worktree-spelled entry when the canonical root registers later', async () => {
      const { canonicalProjectRoot } = await import('@wrongstack/core/utils');
      const { main, wt } = await makeRepoWithWorktree('wt-first');

      // The CLI registered the worktree spelling (as /project add would)…
      await touchProjectInManifest({ projectRoot: wt, globalConfigPath: cfgPath });
      // …then boot arrives with the canonical root of the same repository.
      await touchProjectInManifest({
        projectRoot: canonicalProjectRoot(main),
        globalConfigPath: cfgPath,
      });

      const manifest = await loadManifest(cfgPath);
      expect(manifest.projects, 'one repository, one entry').toHaveLength(1);
      // The entry keeps the root text it was first registered with.
      expect(manifest.projects[0]!.root).toBe(wt);
    });

    it.skipIf(process.platform !== 'win32')(
      'refreshes across a drive-letter case difference',
      async () => {
        const projectRoot = path.join(dir, 'CaseDir');
        await fs.mkdir(projectRoot);
        const lowerSpelling = `${projectRoot.at(0)?.toLowerCase()}${projectRoot.slice(1)}`;

        await touchProjectInManifest({ projectRoot, globalConfigPath: cfgPath });
        await touchProjectInManifest({ projectRoot: lowerSpelling, globalConfigPath: cfgPath });

        const manifest = await loadManifest(cfgPath);
        expect(manifest.projects, 'a case difference is the same directory').toHaveLength(1);
      },
    );
  });
});
