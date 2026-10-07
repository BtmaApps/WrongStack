/** Gradle dependency inventory for Groovy/Kotlin DSL and dependency locking. */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { constructPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { stripSlashComments } from './parse-utils.js';
import {
  fileExistsAsync,
  lockfileEvidence,
  manifestEvidence,
  resolveIn,
  workspaceRoot,
} from './paths.js';

interface GradleDependency {
  readonly name: string;
  readonly requested?: string | undefined;
  readonly scope: DependencyScope;
}

function scopeForConfiguration(configuration: string): DependencyScope {
  if (/test/i.test(configuration)) return 'development';
  if (/compileOnly|annotationProcessor/i.test(configuration)) return 'build';
  if (/runtimeOnly/i.test(configuration)) return 'runtime';
  return 'runtime';
}

/**
 * Every Gradle configuration this adapter recognises, in ONE list.
 *
 * `parseGradleManifest` collects the same dependency through two different
 * syntaxes — a literal coordinate (`implementation("g:a:1.0")`) and a version
 * catalog alias (`implementation(libs.x)`). Both collectors are built from this
 * list because spelling the configuration names inline in both regex literals
 * let them drift apart: `coordinateRegex` carried `annotationProcessor` while
 * `aliasRegex` did not, so `annotationProcessor(libs.x)` was collected by
 * NEITHER collector and the processor silently vanished from the inventory
 * (and therefore from every purl OSV advisory query).
 */
const GRADLE_CONFIGURATIONS = [
  'implementation',
  'api',
  'compileOnly',
  'runtimeOnly',
  'testImplementation',
  'testRuntimeOnly',
  'annotationProcessor',
] as const;

/** Alternation over {@link GRADLE_CONFIGURATIONS}, shared by both collectors. */
const GRADLE_CONFIGURATION_ALTERNATION = GRADLE_CONFIGURATIONS.join('|');

function parseVersionCatalog(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  const libraries = new Map<string, string>();
  let section = '';
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1] ?? '';
      continue;
    }
    const entry = /^(?:"([^"]+)"|([\w.-]+))\s*=\s*(.+)$/.exec(line);
    if (!entry) continue;
    const key = entry[1] ?? entry[2];
    const value = entry[3];
    if (!key || !value) continue;
    if (section === 'versions') {
      const version = /^["']([^"']+)["']/.exec(value)?.[1];
      if (version) versions.set(key, version);
    } else if (section === 'libraries') {
      // String notation is the shortest valid form: `guava = "g:a:v"`.
      const notation = /^["']([^"':]+:[^"':]+(?::[^"']+)?)["']\s*$/.exec(value)?.[1];
      if (notation) {
        libraries.set(key.replace(/[-_]/g, '.'), notation);
        continue;
      }
      const module =
        /\bmodule\s*=\s*["']([^"']+)["']/.exec(value)?.[1] ??
        (() => {
          const group = /\bgroup\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
          const name = /\bname\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
          return group && name ? `${group}:${name}` : undefined;
        })();
      if (!module) continue;
      const version = /\bversion\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
      const ref = /\bversion\.ref\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
      // Gradle turns `-`, `_` and `.` in an alias into accessor separators:
      // `commons_lang` is `libs.commons.lang`.
      libraries.set(
        key.replace(/[-_]/g, '.'),
        `${module}:${version ?? (ref ? (versions.get(ref) ?? '') : '')}`.replace(/:$/, ''),
      );
    }
  }
  return libraries;
}

function parseGradleManifest(
  source: string,
  catalog: ReadonlyMap<string, string>,
): GradleDependency[] {
  // A commented-out declaration is not a dependency.
  const content = stripSlashComments(source);
  const deps: GradleDependency[] = [];
  const coordinateRegex = new RegExp(
    `\\b(${GRADLE_CONFIGURATION_ALTERNATION})\\s*(?:\\(|\\s)\\s*["']([^"']+)["']`,
    'g',
  );
  for (const match of content.matchAll(coordinateRegex)) {
    const configuration = match[1];
    const value = match[2];
    if (!configuration || !value) continue;
    const [group, artifact, version] = value.split(':');
    if (!group || !artifact) continue;
    deps.push({
      name: `${group}:${artifact}`,
      requested: version,
      scope: scopeForConfiguration(configuration),
    });
  }

  // Map notation: Groovy `implementation group: 'g', name: 'a', version: 'v'`
  // and Kotlin `implementation(group = "g", name = "a", version = "v")`. The
  // coordinate collector needs a quote right after the configuration, so these
  // declarations were silently missing from the inventory.
  const mapRegex = new RegExp(
    `\\b(${GRADLE_CONFIGURATION_ALTERNATION})\\s*\\(?\\s*group\\s*[:=]\\s*["']([^"']+)["']\\s*,\\s*name\\s*[:=]\\s*["']([^"']+)["'](?:\\s*,\\s*version\\s*[:=]\\s*["']([^"']+)["'])?`,
    'g',
  );
  for (const match of content.matchAll(mapRegex)) {
    const configuration = match[1];
    const group = match[2];
    const artifact = match[3];
    if (!configuration || !group || !artifact) continue;
    deps.push({
      name: `${group}:${artifact}`,
      requested: match[4],
      scope: scopeForConfiguration(configuration),
    });
  }

  // Kotlin DSL calls `implementation(libs.x)`; Groovy also allows the
  // parenthesis-free `implementation libs.x`, which real Gradle resolves too.
  const aliasRegex = new RegExp(
    `\\b(${GRADLE_CONFIGURATION_ALTERNATION})(?:\\s*\\(\\s*libs\\.([\\w.]+)\\s*\\)|\\s+libs\\.([\\w.]+))`,
    'g',
  );
  for (const match of content.matchAll(aliasRegex)) {
    const configuration = match[1];
    const alias = match[2] ?? match[3];
    if (!configuration || !alias) continue;
    const coordinate = catalog.get(alias);
    if (!coordinate) continue;
    const [group, artifact, version] = coordinate.split(':');
    if (!group || !artifact) continue;
    deps.push({
      name: `${group}:${artifact}`,
      requested: version,
      scope: scopeForConfiguration(configuration),
    });
  }
  return deps;
}

/**
 * The version catalog belongs to the ROOT build: `gradle/libs.versions.toml`
 * next to `settings.gradle(.kts)`. A subproject workspace (`app/`) has no
 * `gradle/` directory of its own, so probing only the workspace root dropped
 * every `libs.*` dependency of every subproject. Walk up to the settings file,
 * never above the analyzed project.
 */
async function findVersionCatalog(
  root: string,
  projectRoot: string | undefined,
): Promise<string | undefined> {
  const stop = projectRoot ? resolve(projectRoot) : undefined;
  let dir = root;
  for (;;) {
    const candidate = join(dir, 'gradle', 'libs.versions.toml');
    if (await fileExistsAsync(candidate)) return candidate;
    if (
      (await fileExistsAsync(join(dir, 'settings.gradle.kts'))) ||
      (await fileExistsAsync(join(dir, 'settings.gradle')))
    ) {
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === stop) return undefined;
    dir = parent;
  }
}

function parseGradleLock(content: string): Map<string, string> {
  const locked = new Map<string, string>();
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const coordinate = /^([^:\s=]+):([^:\s=]+):([^=\s]+)(?:=.*)?$/.exec(line);
    if (coordinate?.[1] && coordinate[2] && coordinate[3])
      locked.set(`${coordinate[1]}:${coordinate[2]}`, coordinate[3]);
  }
  return locked;
}

export class GradleAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'gradle';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const root = workspaceRoot(workspace, options);
    const manifestPath =
      workspace.manifests.find((path) => /build\.gradle(?:\.kts)?$/.test(path)) ??
      ((await fileExistsAsync(join(root, 'build.gradle.kts')))
        ? join(root, 'build.gradle.kts')
        : join(root, 'build.gradle'));
    if (!(await fileExistsAsync(resolveIn(root, manifestPath)))) return [];

    const catalogPath = await findVersionCatalog(root, options.projectRoot);
    const catalog = catalogPath
      ? parseVersionCatalog(await readFile(catalogPath, 'utf8'))
      : new Map<string, string>();
    const direct = parseGradleManifest(
      await readFile(resolveIn(root, manifestPath), 'utf8'),
      catalog,
    );
    const lockPath =
      workspace.lockfiles?.find((path) => path.endsWith('gradle.lockfile')) ??
      join(root, 'gradle.lockfile');
    const locked = (await fileExistsAsync(resolveIn(root, lockPath)))
      ? parseGradleLock(await readFile(resolveIn(root, lockPath), 'utf8'))
      : new Map<string, string>();
    const manifestEv = manifestEvidence(resolveIn(root, manifestPath));
    const lockEv = locked.size > 0 ? lockfileEvidence(resolveIn(root, lockPath)) : undefined;
    const observations: DependencyObservation[] = [];
    const seen = new Set<string>();

    const add = (
      name: string,
      requested: string | undefined,
      scope: DependencyScope,
      isDirect: boolean,
    ): void => {
      if (seen.has(name)) return;
      seen.add(name);
      const version = locked.get(name) ?? requested;
      const lockedVersion = locked.get(name);
      const evidence: Evidence[] = isDirect ? [manifestEv] : [];
      if (lockEv && locked.has(name)) evidence.push(lockEv);
      observations.push({
        id: `dep-${workspace.id}-${name}`,
        workspaceId: workspace.id,
        // constructPurl splits the native groupId:artifactId coordinate into
        // the canonical purl namespace/name form (see purl.ts).
        purl: constructPurl('maven', name, version || undefined),
        ecosystem: 'gradle',
        name,
        sourceType: 'registry',
        direct: isDirect,
        scope: isDirect ? scope : 'transitive',
        ...(requested ? { requested } : {}),
        ...(lockedVersion ? { locked: lockedVersion } : {}),
        status: 'current',
        evidence,
      });
    };

    for (const dep of direct) add(dep.name, dep.requested, dep.scope, true);
    if (options.includeTransitive) {
      for (const [name] of locked) add(name, undefined, 'transitive', false);
    }
    return observations;
  }
}

export const gradleAdapter = new GradleAdapter();
