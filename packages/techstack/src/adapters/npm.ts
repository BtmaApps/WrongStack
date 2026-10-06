/**
 * TechStack — npm ecosystem adapter.
 *
 * Parses package.json manifests and pnpm-lock.yaml (or package-lock.json /
 * yarn.lock) to produce DependencyObservation[] for Node.js workspaces.
 *
 * Supports: pnpm, npm, yarn, bun — determined by lockfile presence.
 *
 * @see docs/specs/techstack-sdd.md §6 Tier A
 */

import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { buildPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  DependencyStatus,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { lockfileEvidence, manifestEvidence, resolveIn, workspaceRoot } from './paths.js';

// ── Lockfile types ───────────────────────────────────────────────────────

type LockfileKind = 'pnpm' | 'npm' | 'yarn' | 'bun' | 'none';

interface LockfileInfo {
  readonly kind: LockfileKind;
  readonly path: string;
}

// ── package.json shape ───────────────────────────────────────────────────

interface PackageJsonDeps {
  readonly [packageName: string]: string;
}

interface PackageJson {
  readonly name?: string | undefined;
  readonly dependencies?: PackageJsonDeps | undefined;
  readonly devDependencies?: PackageJsonDeps | undefined;
  readonly peerDependencies?: PackageJsonDeps | undefined;
  readonly optionalDependencies?: PackageJsonDeps | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Locate the lockfile that governs a workspace.
 *
 * Walks up from the workspace to `stopAt` (the project root). In a pnpm or npm
 * workspace only the repo root holds a lockfile — `packages/cli` has none — so
 * looking only in the workspace directory finds nothing for every package but
 * the root, and every dependency ends up with no resolved version.
 */
async function detectLockfile(workspaceDir: string, stopAt?: string): Promise<LockfileInfo> {
  const candidates: Array<{ file: string; kind: LockfileKind }> = [
    { file: 'pnpm-lock.yaml', kind: 'pnpm' },
    { file: 'package-lock.json', kind: 'npm' },
    { file: 'yarn.lock', kind: 'yarn' },
    // bun ≥ 1.2 writes the text `bun.lock`; `bun.lockb` is the older binary form.
    { file: 'bun.lock', kind: 'bun' },
    { file: 'bun.lockb', kind: 'bun' },
  ];

  const ceiling = stopAt ? resolve(stopAt) : undefined;
  let dir = resolve(workspaceDir);

  for (;;) {
    for (const c of candidates) {
      const candidate = join(dir, c.file);
      try {
        await access(candidate);
        return { kind: c.kind, path: candidate };
      } catch {
        /* absent */
      }
    }
    if (ceiling && dir === ceiling) break;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    // Without a ceiling, don't wander above the workspace at all.
    if (!ceiling) break;
    dir = parent;
  }
  return { kind: 'none', path: '' };
}

/** Strip pnpm's peer-dependency suffix: `19.1.0(react@19.1.0)` → `19.1.0`. */
function stripPeerSuffix(version: string): string {
  const paren = version.indexOf('(');
  return (paren === -1 ? version : version.slice(0, paren)).trim();
}

/**
 * Extract the resolved versions pnpm recorded for EVERY importer (workspace),
 * keyed by importer path.
 *
 * pnpm's `importers:` section maps each workspace to the exact version it
 * resolved for every declared dependency — which is precisely the per-workspace
 * question this adapter asks, and it stays correct when two workspaces pin
 * different versions of the same package. Collecting all importers in one pass
 * (instead of one targeted scan per workspace) is what lets the lockfile be
 * parsed once and shared across every workspace in a monorepo inventory run.
 *
 * Line-based on purpose: the lockfile is machine-generated with a stable
 * 2-space indent, and pulling in a YAML parser for four fields isn't worth the
 * dependency.
 *
 * ```yaml
 * importers:
 *   packages/cli:            # 2 spaces — importer
 *     dependencies:          # 4 spaces — section
 *       react:               # 6 spaces — package
 *         specifier: ^19.0.0 # 8 spaces — fields
 *         version: 19.1.0
 * ```
 */
function parsePnpmImporters(lockContent: string): Map<string, Map<string, string>> {
  const importers = new Map<string, Map<string, string>>();
  const lines = lockContent.split(/\r?\n/);

  let inImporters = false;
  let currentImporter: string | undefined;
  let currentVersions: Map<string, string> | undefined;
  let currentPackage: string | undefined;

  for (const raw of lines) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;

    // Top-level key ends the importers block.
    if (!/^\s/.test(raw)) {
      if (inImporters) break;
      inImporters = raw.startsWith('importers:');
      continue;
    }
    if (!inImporters) continue;

    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (indent === 2) {
      // New importer — `packages/cli:` or `.:`
      const key = line.endsWith(':') ? unquote(line.slice(0, -1)) : undefined;
      if (key === undefined) {
        currentImporter = undefined;
        currentVersions = undefined;
      } else {
        currentImporter = key;
        currentVersions = new Map<string, string>();
        importers.set(currentImporter, currentVersions);
      }
      currentPackage = undefined;
      continue;
    }
    if (!currentImporter || currentVersions === undefined) continue;

    if (indent === 4) {
      currentPackage = undefined; // dependencies: / devDependencies: / …
      continue;
    }
    if (indent === 6 && line.endsWith(':')) {
      currentPackage = unquote(line.slice(0, -1));
      continue;
    }
    if (indent >= 8 && currentPackage && line.startsWith('version:')) {
      const version = stripPeerSuffix(unquote(line.slice('version:'.length).trim()));
      // `link:../core` is a workspace link, not a released version — recording
      // it as `locked` would make a local package look like a registry one.
      if (version && !version.startsWith('link:') && !version.startsWith('file:')) {
        currentVersions.set(currentPackage, version);
      }
      currentPackage = undefined;
    }
  }

  return importers;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse package-lock.json (npm) to extract resolved versions.
 */
function parseNpmLockVersions(lockContent: string): Map<string, string[]> {
  const versions = new Map<string, string[]>();
  /** Record one instance, ignoring duplicates of the same name+version. */
  const record = (name: string, version: string): void => {
    const existing = versions.get(name);
    if (!existing) {
      versions.set(name, [version]);
      return;
    }
    if (!existing.includes(version)) existing.push(version);
  };

  try {
    const lock = JSON.parse(lockContent);
    // npm v3: lock.dependencies
    const deps = lock.dependencies ?? {};
    for (const [name, info] of Object.entries(deps)) {
      const depInfo = info as { version?: string };
      if (depInfo.version) {
        // Strip version prefixes like ^, ~, >=
        const cleanVersion = depInfo.version.replace(/^[^0-9]+/, '');
        record(name, cleanVersion);
      }
    }
    // npm v2 (lockfileVersion 2+): lock.packages. Its keys are INSTALL PATHS,
    // not names: the root project is keyed "" and a deduped/conflicting
    // transitive install is keyed "node_modules/a/node_modules/b" (this repo's
    // own website/package-lock.json carries an empty root key and 18 such
    // nested keys). Take the segment after the LAST node_modules/ and skip
    // keys without one, so the root entry never becomes an empty-named
    // dependency and an install path never becomes a package name.
    const packages = lock.packages ?? {};
    for (const key of Object.keys(packages)) {
      const pkgInfo = packages[key] as { version?: string };
      const marker = key.lastIndexOf('node_modules/');
      if (!pkgInfo.version || marker < 0) continue;
      const name = key.slice(marker + 'node_modules/'.length);
      if (!name) continue;
      record(name, pkgInfo.version);
    }
  } catch {
    // Malformed lockfile — return empty map
  }
  return versions;
}

/** Name and range of a yarn lock key spec (`minimist@^1.2.0`, `@a/b@npm:^2`). */
function splitYarnSpec(spec: string): { name: string; range: string } | undefined {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  if (at <= 0) return undefined;
  return { name: spec.slice(0, at), range: spec.slice(at + 1).replace(/^npm:/, '') };
}

/**
 * Parse yarn.lock — classic v1 (`version "1.2.3"`) and berry (`version: 1.2.3`).
 * Each block header lists the specs it resolves (`"a@^1", a@~1.2:`), so the
 * direct dependency `a: ^1` resolves through `specs.get('a@^1')`.
 */
function parseYarnLockVersions(lockContent: string): {
  versions: Map<string, string[]>;
  specs: Map<string, string>;
} {
  const versions = new Map<string, string[]>();
  const specs = new Map<string, string>();
  let current: Array<{ name: string; range: string }> = [];
  for (const line of lockContent.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line) && line.trimEnd().endsWith(':')) {
      current = line
        .trimEnd()
        .slice(0, -1)
        .split(',')
        .map((spec) => splitYarnSpec(spec.trim().replace(/^"|"$/g, '')))
        .filter((spec): spec is { name: string; range: string } => spec !== undefined);
      continue;
    }
    const version = /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(line)?.[1];
    if (!version || current.length === 0) continue;
    for (const { name, range } of current) {
      // berry lists the project's own workspaces (`app@workspace:.`, version
      // `0.0.0-use.local`) and local links beside registry packages.
      if (/^(?:workspace|link|portal|file):/.test(range)) continue;
      specs.set(`${name}@${range}`, version);
      const existing = versions.get(name);
      if (!existing) versions.set(name, [version]);
      else if (!existing.includes(version)) existing.push(version);
    }
    current = [];
  }
  return { versions, specs };
}

/**
 * Parse bun's text lockfile (`bun.lock`, JSON with trailing commas). Its
 * `packages` map is keyed by install path (`minimist`, `parent/minimist`);
 * the first array element is `name@version`.
 */
function parseBunLockVersions(lockContent: string): {
  versions: Map<string, string[]>;
  hoisted: Map<string, string>;
} {
  const versions = new Map<string, string[]>();
  const hoisted = new Map<string, string>();
  try {
    const lock = JSON.parse(lockContent.replace(/,(\s*[}\]])/g, '$1')) as {
      packages?: Record<string, unknown>;
    };
    for (const [key, entry] of Object.entries(lock.packages ?? {})) {
      const ident = Array.isArray(entry) ? entry[0] : undefined;
      if (typeof ident !== 'string') continue;
      const spec = splitYarnSpec(ident);
      if (!spec || !/^\d/.test(spec.range)) continue;
      const existing = versions.get(spec.name);
      if (!existing) versions.set(spec.name, [spec.range]);
      else if (!existing.includes(spec.range)) existing.push(spec.range);
      if (key === spec.name) hoisted.set(spec.name, spec.range);
    }
  } catch {
    // Malformed lockfile — return empty maps
  }
  return { versions, hoisted };
}

function parsePnpmAllVersions(lockContent: string): Map<string, string[]> {
  const versions = new Map<string, string[]>();
  let inPackages = false;
  for (const raw of lockContent.split(/\r?\n/)) {
    // Blank lines and comments are not top-level keys. Skipping them BEFORE the
    // section test matters: a real pnpm lockfile puts a blank line directly
    // after `packages:` (and between entries), so without this guard the flag
    // reset on that blank, the section closed before its first entry, and
    // `allVersions` came back empty — dropping EVERY transitive instance from
    // the SBOM while direct rows kept resolving, which made the two
    // includeTransitive modes return an identical count. `parsePnpmImporters`
    // has always carried this guard.
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      inPackages = raw.startsWith('packages:') || raw.startsWith('snapshots:');
      continue;
    }
    if (!inPackages) continue;
    const indent = raw.length - raw.trimStart().length;
    if (indent !== 2) continue;
    const trimmed = raw.trim();
    const separator = trimmed.indexOf(':');
    if (separator < 0) continue;
    const key = unquote(trimmed.slice(0, separator));
    const clean = stripPeerSuffix(key);
    const splitAt = clean.lastIndexOf('@');
    if (splitAt <= 0) continue;
    const name = clean.slice(0, splitAt);
    const version = clean.slice(splitAt + 1);
    if (!name || !/^\d/.test(version)) continue;
    // A package legitimately appears at several versions — pnpm writes one
    // `name@version` key per instance (this repo's own lock: fs-extra ×12,
    // minimatch ×8). Keeping only the first per NAME hid every other instance
    // from the inventory, and OSV is queried per purl.
    const existing = versions.get(name);
    if (!existing) versions.set(name, [version]);
    else if (!existing.includes(version)) existing.push(version);
  }
  return versions;
}

/**
 * Parsed pnpm lockfile, shared across every workspace governed by the file.
 * `importers` maps each workspace path to its resolved direct versions;
 * `allVersions` holds every `name@version` instance in the file.
 */
interface PnpmLockParse {
  readonly importers: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly allVersions: ReadonlyMap<string, readonly string[]>;
}

/**
 * Lockfile parses memoised per (path, mtimeMs, size).
 *
 * A pnpm monorepo has ONE lockfile governing every workspace: without this
 * cache, `inventory()` re-reads and re-parses the whole lockfile for every
 * workspace (this repository: 368 KB × 24 workspaces per run — measured in
 * PERF_LOG.md, 2026-09-26 techstack round). The stat guard keeps a hit honest
 * across `pnpm install` runs; the capacity cap bounds memory in long-lived
 * server processes that scan many projects.
 */
const PNPM_LOCK_CACHE_CAPACITY = 4;
const pnpmLockCache = new Map<string, { mtimeMs: number; size: number; parse: PnpmLockParse }>();

/**
 * pnpm that manages its own version (`packageManager`) writes the lockfile as
 * two YAML documents: an env document (`importers: .: packageManagerDependencies:
 * pnpm`, `packages: @pnpm/exe.*`) and then the project lockfile. The importer
 * parser stops after the first `importers:` block, so it read pnpm's own entry
 * and every project dependency came out unlocked. Keep the last document that
 * declares importers — the project's.
 */
function projectLockDocument(content: string): string {
  const documents = content.split(/^---[ \t]*\r?$/m);
  if (documents.length < 2) return content;
  const withImporters = documents.filter((doc) => /^importers:/m.test(doc));
  return withImporters.at(-1) ?? content;
}

async function loadPnpmLockParse(path: string): Promise<PnpmLockParse | undefined> {
  let mtimeMs: number;
  let size: number;
  try {
    const stats = await stat(path);
    mtimeMs = stats.mtimeMs;
    size = stats.size;
  } catch {
    return undefined;
  }
  const cached = pnpmLockCache.get(path);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    // Refresh recency so the eviction below is LRU, not insertion order.
    pnpmLockCache.delete(path);
    pnpmLockCache.set(path, cached);
    return cached.parse;
  }
  try {
    const content = projectLockDocument(await readFile(path, 'utf-8'));
    const parse: PnpmLockParse = {
      importers: parsePnpmImporters(content),
      allVersions: parsePnpmAllVersions(content),
    };
    pnpmLockCache.delete(path);
    pnpmLockCache.set(path, { mtimeMs, size, parse });
    if (pnpmLockCache.size > PNPM_LOCK_CACHE_CAPACITY) {
      const oldest = pnpmLockCache.keys().next().value;
      if (oldest !== undefined) pnpmLockCache.delete(oldest);
    }
    return parse;
  } catch {
    return undefined;
  }
}

/**
 * Determine the dependency scope from the manifest section it appears in.
 */
function scopeForSection(section: string): DependencyScope {
  switch (section) {
    case 'dependencies':
      return 'runtime';
    case 'devDependencies':
      return 'development';
    case 'peerDependencies':
      return 'peer';
    default:
      return 'optional';
  }
}

/**
 * Determine status: local_path for file: / link: / workspace:,
 * git_dependency for git+ / github: / git:, registry otherwise.
 */
function statusForSpec(spec: string): DependencyStatus {
  if (spec.startsWith('file:') || spec.startsWith('link:') || spec.startsWith('workspace:')) {
    return 'local_path';
  }
  if (spec.startsWith('git+') || spec.startsWith('github:') || spec.startsWith('git:')) {
    return 'git_dependency';
  }
  return 'current';
}

/**
 * Check if a spec is a local/git reference (not resolvable to a registry version).
 */
function isRegistrySpec(spec: string): boolean {
  return (
    !spec.startsWith('file:') &&
    !spec.startsWith('link:') &&
    !spec.startsWith('workspace:') &&
    !spec.startsWith('git+') &&
    !spec.startsWith('github:') &&
    !spec.startsWith('git:')
  );
}

// ── Adapter ──────────────────────────────────────────────────────────────

export class NpmAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'npm';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const root = workspaceRoot(workspace, options);
    // Pick the actual package.json rather than `manifests[0]` — discovery also
    // reports tsconfig.json as a manifest, and sort order is not a contract.
    const manifestPath = resolveIn(
      root,
      workspace.manifests.find((m) => m.endsWith('package.json')) ?? 'package.json',
    );

    // Read package.json
    let pkg: PackageJson;
    let manifestContent: string;
    try {
      manifestContent = await readFile(manifestPath, 'utf-8');
      pkg = JSON.parse(manifestContent) as PackageJson;
    } catch {
      return []; // Can't read manifest — no dependencies
    }

    const manifestEv = manifestEvidence(manifestPath);

    // Read lockfile for resolved versions
    const lockInfo = await detectLockfile(root, options.projectRoot);
    const resolvedVersions = new Map<string, string>();
    const allLockVersions = new Map<string, readonly string[]>();
    let lockEv: Evidence | undefined;
    if (lockInfo.kind === 'pnpm') {
      // The importer key is this workspace's path relative to the lockfile,
      // POSIX-style; the root workspace is `.`.
      const importerPath =
        relative(dirname(lockInfo.path), root).split(/[/\\]/).filter(Boolean).join('/') || '.';
      const lockParse = await loadPnpmLockParse(lockInfo.path);
      if (lockParse) {
        const parsed = lockParse.importers.get(importerPath);
        if (parsed) for (const [k, v] of parsed) resolvedVersions.set(k, v);
        for (const [k, v] of lockParse.allVersions) allLockVersions.set(k, v);
        if (parsed && parsed.size > 0) lockEv = lockfileEvidence(lockInfo.path);
      }
    } else if (lockInfo.kind === 'npm') {
      try {
        const lockContent = await readFile(lockInfo.path, 'utf-8');
        const parsed = parseNpmLockVersions(lockContent);
        for (const [k, v] of parsed) {
          // Direct rows report one resolved version; every instance is kept for
          // the transitive pass below.
          const first = v[0];
          if (first) resolvedVersions.set(k, first);
          allLockVersions.set(k, v);
        }
        lockEv = lockfileEvidence(lockInfo.path);
      } catch {
        // ignore
      }
    } else if (
      lockInfo.kind === 'yarn' ||
      (lockInfo.kind === 'bun' && lockInfo.path.endsWith('.lock'))
    ) {
      // Both were detected and then never read: every yarn/bun dependency had
      // no resolved version, so it reached OSV without one.
      try {
        const lockContent = await readFile(lockInfo.path, 'utf-8');
        const requestedByName = {
          ...pkg.optionalDependencies,
          ...pkg.peerDependencies,
          ...pkg.devDependencies,
          ...pkg.dependencies,
        };
        if (lockInfo.kind === 'yarn') {
          const { versions, specs } = parseYarnLockVersions(lockContent);
          for (const [name, requested] of Object.entries(requestedByName)) {
            const version = specs.get(`${name}@${String(requested).replace(/^npm:/, '')}`);
            if (version) resolvedVersions.set(name, version);
          }
          for (const [k, v] of versions) allLockVersions.set(k, v);
        } else {
          const { versions, hoisted } = parseBunLockVersions(lockContent);
          for (const name of Object.keys(requestedByName)) {
            const version = hoisted.get(name);
            if (version) resolvedVersions.set(name, version);
          }
          for (const [k, v] of versions) allLockVersions.set(k, v);
        }
        if (allLockVersions.size > 0) lockEv = lockfileEvidence(lockInfo.path);
      } catch {
        // ignore
      }
    }

    // Process each dependency section
    const sections: Array<{ name: string; deps: PackageJsonDeps | undefined }> = [
      { name: 'dependencies', deps: pkg.dependencies },
      { name: 'devDependencies', deps: pkg.devDependencies },
      { name: 'peerDependencies', deps: pkg.peerDependencies },
      { name: 'optionalDependencies', deps: pkg.optionalDependencies },
    ];

    const seen = new Set<string>(); // dedup within workspace

    for (const section of sections) {
      if (!section.deps) continue;
      const scope = scopeForSection(section.name);

      for (const [key, manifestSpec] of Object.entries(section.deps)) {
        const dedupKey = `${key}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // An npm alias (`"typescript5": "npm:typescript@5.9.3"`) installs
        // `typescript`; pnpm locks it as `typescript@5.9.3`. Read verbatim it
        // became `pkg:npm/typescript5@typescript%405.9.3`, a package that does
        // not exist. Describe the package actually installed.
        const alias = /^npm:((?:@[^/@]+\/)?[^@]+)(?:@(.*))?$/.exec(manifestSpec);
        const name = alias ? alias[1]! : key;
        const requested = alias ? (alias[2] ?? '*') : manifestSpec;
        const isRegistry = isRegistrySpec(requested);
        const status = statusForSpec(requested);

        // Resolve locked version from lockfile
        const lockedRaw = resolvedVersions.get(key);
        const locked =
          alias && lockedRaw?.startsWith(`${name}@`) ? lockedRaw.slice(name.length + 1) : lockedRaw;

        // Build PURL for registry deps
        const purl =
          isRegistry && locked
            ? buildPurl({ type: 'npm', name, version: locked })
            : isRegistry
              ? buildPurl({ type: 'npm', name })
              : undefined;

        const evidence: Evidence[] = [manifestEv];
        if (lockEv && locked) evidence.push(lockEv);

        observations.push({
          // The manifest key keeps two aliases of one package distinct.
          id: `dep-${workspace.id}-${key}`,
          workspaceId: workspace.id,
          ...(purl ? { purl } : {}),
          ecosystem: 'npm' as const,
          name,
          sourceType: isRegistry ? 'registry' : status === 'local_path' ? 'path' : 'git',
          direct: true,
          scope,
          requested,
          ...(locked ? { locked } : {}),
          status,
          evidence,
        });
      }
    }

    if (options.includeTransitive && lockEv) {
      // A lockfile lists every INSTANCE of a package — this repo's own pnpm lock
      // holds fs-extra at 12 versions and minimatch at 8 — and OSV is queried per
      // purl, so an omitted version is an advisory blind spot. Emit one row per
      // instance the direct rows did not already cover; the id carries the
      // version only when a name holds several instances, so single-instance
      // packages keep the historical `dep-<ws>-<name>` id.
      const emittedInstances = new Set(
        observations.flatMap((dep) => (dep.locked ? [`${dep.name}@${dep.locked}`] : [])),
      );
      for (const [name, versions] of allLockVersions) {
        const multiple = versions.length > 1;
        for (const locked of versions) {
          const instance = `${name}@${locked}`;
          if (emittedInstances.has(instance)) continue;
          emittedInstances.add(instance);
          observations.push({
            id: multiple ? `dep-${workspace.id}-${name}@${locked}` : `dep-${workspace.id}-${name}`,
            workspaceId: workspace.id,
            purl: buildPurl({ type: 'npm', name, version: locked }),
            ecosystem: 'npm',
            name,
            sourceType: 'registry',
            direct: false,
            scope: 'transitive',
            locked,
            status: 'current',
            evidence: [lockEv],
          });
        }
      }
    }

    return observations;
  }
}

/**
 * Default singleton instance.
 */
export const npmAdapter = new NpmAdapter();
