/**
 * TechStack — npm ecosystem adapter.
 *
 * Parses package.json manifests and pnpm-lock.yaml (or package-lock.json /
 * yarn.lock) to produce DependencyObservation[] for Node.js workspaces.
 *
 * Supports: pnpm, npm, yarn, bun — determined by lockfile presence.
 *
 * @see docs/archive/specs/techstack-sdd.md §6 Tier A
 */
import { access, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { constructPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  DependencyStatus,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import {
  loadPnpmLockParse,
  parseBunLockVersions,
  parseNpmLockVersions,
  parseYarnLockVersions,
} from './npm-lockfile-parse.js';
import { stripBom } from './parse-utils.js';
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
 * npm's spec grammar (npm-package-arg) for what is NOT a registry package. A
 * prefix list (file:/link:/workspace:/git+/github:/git:) missed paths written
 * without `file:` (`../lib`), hosted shorthands (`user/repo#tag`, `gitlab:u/r`),
 * scp-style git (`git@host:u/r.git`) and tarball URLs — each was inventoried as
 * `pkg:npm/<manifest key>`, a public package that is not what gets installed.
 */
const NPM_LOCAL_SPEC =
  /^(?:file:|link:|workspace:|portal:|\.{1,2}(?:[\\/]|$)|~[\\/]|[\\/]|[a-z]:[\\/])|\.(?:tgz|tar\.gz|tar)$/i;
const NPM_GIT_SPEC =
  /^(?:git\+|git:|github:|gitlab:|bitbucket:|gist:|[^@\s/:]+@[^\s/:]+:|[^\s@/:#]+\/[^\s/:#]+(?:#.*)?$)|^https?:\/\/\S+\.git(?:#.*)?$/i;
/** A remote tarball; recorded like a local archive, as the other adapters do. */
const NPM_URL_SPEC = /^https?:\/\//i;

/**
 * Determine status: local_path for a path, workspace link or tarball,
 * git_dependency for a git URL or hosted shorthand, registry otherwise.
 */
function statusForSpec(spec: string): DependencyStatus {
  if (NPM_LOCAL_SPEC.test(spec)) return 'local_path';
  if (NPM_GIT_SPEC.test(spec)) return 'git_dependency';
  if (NPM_URL_SPEC.test(spec)) return 'local_path';
  return 'current';
}

/**
 * Check if a spec is a local/git reference (not resolvable to a registry version).
 */
function isRegistrySpec(spec: string): boolean {
  return statusForSpec(spec) === 'current';
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
      pkg = JSON.parse(stripBom(manifestContent)) as PackageJson;
    } catch {
      return []; // Can't read manifest — no dependencies
    }

    const manifestEv = manifestEvidence(manifestPath);

    // Read lockfile for resolved versions
    const lockInfo = await detectLockfile(root, options.projectRoot);
    const resolvedVersions = new Map<string, string>();
    const allLockVersions = new Map<string, readonly string[]>();
    /**
     * Lockfile install-path name → the package it really installs (npm
     * aliases). The transitive pass has to report the REAL name: npm installs
     * an alias under the alias name, so the lockfile key is not a package
     * that exists on the registry.
     */
    const lockfileAliases = new Map<string, string>();
    /** Manifest keys the lockfile installs as workspace links. */
    const linkedDeps = new Set<string>();
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
        const { versions, installed, links, aliases } = parseNpmLockVersions(lockContent);
        const importer = relative(dirname(lockInfo.path), root)
          .split(/[/\\]/)
          .filter(Boolean)
          .join('/');
        // A dependency Node resolves to a `link: true` install is a workspace
        // package, whatever its manifest spec says (`"lodash": "4.17.20"`
        // links a sibling named lodash) — not the public npm release.
        for (const key of Object.keys({
          ...pkg.optionalDependencies,
          ...pkg.peerDependencies,
          ...pkg.devDependencies,
          ...pkg.dependencies,
        })) {
          const own = importer ? `${importer}/node_modules/${key}` : undefined;
          const resolvedPath =
            own && (installed.has(own) || links.has(own)) ? own : `node_modules/${key}`;
          if (links.has(resolvedPath)) linkedDeps.add(key);
        }
        for (const [k, v] of versions) {
          // Direct rows report the instance Node resolves for THIS workspace:
          // its own node_modules, then the hoisted root. The first instance in
          // key order can be another package's private copy
          // (`node_modules/a/node_modules/b` sorts before `node_modules/b`).
          // Every instance is kept for the transitive pass below.
          const direct =
            (importer ? installed.get(`${importer}/node_modules/${k}`) : undefined) ??
            installed.get(`node_modules/${k}`) ??
            v[0];
          if (direct) resolvedVersions.set(k, direct);
          allLockVersions.set(k, v);
        }
        for (const [alias, real] of aliases) lockfileAliases.set(alias, real);
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
          const { versions, specs, linked } = parseYarnLockVersions(lockContent);
          for (const [name, requested] of Object.entries(requestedByName)) {
            const spec = `${name}@${String(requested).replace(/^npm:/, '')}`;
            const version = specs.get(spec);
            if (version) resolvedVersions.set(name, version);
            else if (linked.has(spec)) linkedDeps.add(name);
          }
          for (const [k, v] of versions) allLockVersions.set(k, v);
        } else {
          const { versions, hoisted, linked } = parseBunLockVersions(lockContent);
          for (const name of Object.keys(requestedByName)) {
            const version = hoisted.get(name);
            if (version) resolvedVersions.set(name, version);
            else if (linked.has(name)) linkedDeps.add(name);
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
        const linked = linkedDeps.has(key);
        const isRegistry = !linked && isRegistrySpec(requested);
        const status = linked ? 'local_path' : statusForSpec(requested);

        // Resolve locked version from lockfile
        const lockedRaw = resolvedVersions.get(key);
        const locked =
          alias && lockedRaw?.startsWith(`${name}@`) ? lockedRaw.slice(name.length + 1) : lockedRaw;

        // Build PURL for registry deps. constructPurl puts an npm scope in the
        // namespace (`pkg:npm/%40types/node`); buildPurl on the raw name
        // encoded the separator (`%40types%2Fnode`), a non-canonical purl.
        const purl =
          isRegistry && locked
            ? constructPurl('npm', name, locked)
            : isRegistry
              ? constructPurl('npm', name)
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
          sourceType: linked
            ? 'workspace'
            : isRegistry
              ? 'registry'
              : status === 'local_path'
                ? 'path'
                : 'git',
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
        // An npm alias installs the REAL package under the alias name, so the
        // lockfile key is not a package that exists. Report the real name -
        // the direct row already carries it under that name, and the instance
        // check below then skips the duplicate.
        const realName = lockfileAliases.get(name) ?? name;
        const multiple = versions.length > 1;
        for (const locked of versions) {
          const instance = `${realName}@${locked}`;
          if (emittedInstances.has(instance)) continue;
          emittedInstances.add(instance);
          observations.push({
            id: multiple
              ? `dep-${workspace.id}-${realName}@${locked}`
              : `dep-${workspace.id}-${realName}`,
            workspaceId: workspace.id,
            purl: constructPurl('npm', realName, locked),
            ecosystem: 'npm',
            name: realName,
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
