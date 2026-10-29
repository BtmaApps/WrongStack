import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ConfigError } from '@wrongstack/contracts/types';
import {
  atomicWrite,
  canonicalProjectRoot,
  projectSlug,
  readProjectIdentity,
  withFileLock,
  wstackGlobalRoot,
} from '@wrongstack/core/utils';

// Shared project-manifest types and persistence.

export interface ProjectEntry {
  /** User-friendly name (defaults to dirname, can be renamed). */
  name: string;
  /** Absolute path to the project root. */
  root: string;
  /** Stable unique slug (dirname-hash) for per-project data storage. */
  slug: string;
  /** Repo-committed identity shared by clones, worktrees, and machines. */
  projectId?: string | undefined;
  /** ISO timestamp of last use. */
  lastSeen?: string | undefined;
  /** ISO timestamp of when the project was first registered. */
  createdAt?: string | undefined;
  /** Working directory of the most recent session (may differ from root). */
  lastWorkingDir?: string | undefined;
}

export interface ProjectsManifest {
  projects: ProjectEntry[];
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isProjectEntry(value: unknown): value is ProjectEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['name'] === 'string' &&
    typeof entry['root'] === 'string' &&
    typeof entry['slug'] === 'string' &&
    isOptionalString(entry['projectId']) &&
    isOptionalString(entry['lastSeen']) &&
    isOptionalString(entry['createdAt']) &&
    isOptionalString(entry['lastWorkingDir'])
  );
}

// ── Path resolution ───────────────────────────────────────────────────

function projectsJsonPath(globalConfigPath?: string | undefined): string {
  const base = globalConfigPath ? path.dirname(globalConfigPath) : wstackGlobalRoot();
  return path.join(base, 'projects.json');
}

function projectsDataDir(globalConfigPath?: string | undefined): string {
  const base = globalConfigPath ? path.dirname(globalConfigPath) : wstackGlobalRoot();
  return path.join(base, 'projects');
}

// ── Read / Write manifest ─────────────────────────────────────────────

export async function loadManifest(
  globalConfigPath?: string | undefined,
): Promise<ProjectsManifest> {
  const file = projectsJsonPath(globalConfigPath);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { projects: [] };
    throw new ConfigError({
      message: `Unable to read projects manifest: ${file}`,
      code: 'CONFIG_INVALID',
      context: { file, phase: 'manifest-read' },
      cause: error,
    });
  }
  try {
    // A Windows editor saves the file with a UTF-8 BOM, which JSON.parse rejects.
    const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as ProjectsManifest).projects) ||
      !(parsed as ProjectsManifest).projects.every(isProjectEntry)
    ) {
      throw new Error('projects must be an array');
    }
    return { projects: (parsed as ProjectsManifest).projects };
  } catch (error) {
    throw new ConfigError({
      message: `Unable to parse projects manifest: ${file}`,
      code: 'CONFIG_PARSE_FAILED',
      context: { file, phase: 'manifest-parse' },
      cause: error,
    });
  }
}

export async function saveManifest(
  manifest: ProjectsManifest,
  globalConfigPath?: string | undefined,
): Promise<void> {
  const file = projectsJsonPath(globalConfigPath);
  await atomicWrite(file, JSON.stringify(manifest, null, 2), { encoding: 'utf8' });
}

/**
 * Load, change and save projects.json under the manifest lock that boot
 * registration and {@link touchProjectInManifest} hold. A snapshot loaded
 * earlier and saved later erased projects other sessions registered in
 * between. `mutate` returns whether it changed anything; nothing is written
 * when it did not.
 */
export async function updateManifest(
  globalConfigPath: string | undefined,
  mutate: (manifest: ProjectsManifest) => boolean,
): Promise<void> {
  await withFileLock(projectsJsonPath(globalConfigPath), async () => {
    const manifest = await loadManifest(globalConfigPath);
    if (mutate(manifest)) await saveManifest(manifest, globalConfigPath);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Generate a unique slug from a project root path.
 *
 * Must equal the canonical `projectSlug` — the directory boot actually keys
 * the project's state under. A local re-derivation drifted from it (linked Git
 * worktrees share their main checkout's identity; a 40-char cut ending on a
 * separator keeps no trailing hyphen), so the manifest named a data directory
 * nothing else used.
 */
export function generateSlug(root: string): string {
  return projectSlug(path.resolve(root));
}

/**
 * Find a project entry by slug, name, or root (partial match).
 */
export function findProject(manifest: ProjectsManifest, query: string): ProjectEntry | undefined {
  const lower = query.toLowerCase();
  // Exact slug match first
  let found = manifest.projects.find((p) => p.slug === lower);
  if (found) return found;
  // Name match
  found = manifest.projects.find((p) => p.name.toLowerCase() === lower);
  if (found) return found;
  // Root ends-with match
  found = manifest.projects.find((p) => p.root.toLowerCase().endsWith(lower));
  if (found) return found;
  // Root contains match
  found = manifest.projects.find((p) => p.root.toLowerCase().includes(lower));
  return found;
}

/**
 * Ensure the per-project data directory exists under ~/.wrongstack/projects/<slug>/.
 */
export async function ensureProjectDataDir(
  slug: string,
  globalConfigPath?: string | undefined,
): Promise<string> {
  const dir = path.join(projectsDataDir(globalConfigPath), slug);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Idempotent project registration: ensure `projectRoot` has an entry in
 * projects.json, creating one when missing and refreshing `lastSeen` /
 * `lastWorkingDir` when present. Returns the (created or updated) entry.
 *
 * Every surface that opens a project (CLI/TUI boot, standalone WebUI boot,
 * WebUI projects.select) funnels through this so the manifest is the single
 * source of truth for "which projects exist" regardless of entry point.
 * Concurrent processes booting on the same machine serialize via a file
 * lock around the read-modify-write.
 */
export async function touchProjectInManifest(opts: {
  projectRoot: string;
  globalConfigPath?: string | undefined;
  /** Working dir of this session when it differs from the root. */
  workingDir?: string | undefined;
  /** Friendly name for a NEWLY created entry (default: basename). */
  name?: string | undefined;
}): Promise<ProjectEntry> {
  const root = path.resolve(opts.projectRoot);
  // Identity is the canonical root (what boot registers and what the slug is
  // derived from), not raw text: the same repository reached through a linked
  // worktree or a differently-cased spelling must refresh the entry, not
  // duplicate it under the same slug.
  const identityRoot = canonicalProjectRoot(root);
  const projectId = (await readProjectIdentity(root).catch(() => undefined))?.projectId;
  const file = projectsJsonPath(opts.globalConfigPath);
  let entry: ProjectEntry | undefined;
  await withFileLock(file, async () => {
    const manifest = await loadManifest(opts.globalConfigPath);
    const now = new Date().toISOString();
    entry = manifest.projects.find((p) => canonicalProjectRoot(p.root) === identityRoot);
    if (entry) {
      entry.lastSeen = now;
      if (projectId) entry.projectId = projectId;
      if (opts.workingDir) entry.lastWorkingDir = path.resolve(opts.workingDir);
    } else {
      entry = {
        name: opts.name ?? path.basename(root),
        root,
        slug: generateSlug(root),
        projectId,
        createdAt: now,
        lastSeen: now,
        lastWorkingDir: opts.workingDir ? path.resolve(opts.workingDir) : undefined,
      };
      manifest.projects.push(entry);
    }
    await saveManifest(manifest, opts.globalConfigPath);
  });
  await ensureProjectDataDir(expectEntry(entry).slug, opts.globalConfigPath);
  return expectEntry(entry);
}

function expectEntry(e: ProjectEntry | undefined): ProjectEntry {
  if (!e)
    throw new ConfigError({
      message: 'touchProjectInManifest: entry not resolved',
      code: 'CONFIG_INVALID',
      context: { phase: 'manifest-resolve' },
    });
  return e;
}
