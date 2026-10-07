/**
 * TechStack — Dart ecosystem adapter.
 *
 * Parses pubspec.yaml and pubspec.lock to produce
 * DependencyObservation[] for Dart/Flutter workspaces.
 *
 * @see docs/archive/specs/techstack-sdd.md §6 Tier A
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { constructPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { stripInlineComment } from './parse-utils.js';
import { fileExists, lockfileEvidence, manifestEvidence, workspaceRoot } from './paths.js';

// ── Minimal YAML parser (line-based, sufficient for pubspec.yaml) ────────

/** A quoted YAML scalar (`'>=0.17.0 <0.20.0'`, `"^1.9.0"`) without its quotes. */
function yamlScalar(value: string): string {
  return /^(['"])(.*)\1$/.exec(value)?.[2] ?? value;
}

/**
 * Parse a pubspec.yaml to extract dependencies sections.
 * Returns a map of section name → Map of dependency name → constraint.
 *
 * Handles:
 *   dependencies:
 *     flutter:
 *       sdk: flutter
 *     http: ^1.2.0
 *   dev_dependencies:
 *     test: ^1.24.0
 */
function parsePubspecYaml(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let currentSection: string | undefined;
  let currentName: string | undefined;

  for (const raw of content.split('\n')) {
    // A YAML comment starts at a whitespace-preceded `#` outside quotes; left
    // in, it hid section headers (`dependencies: # runtime`) and became part
    // of a constraint (`^1.18.0 # used by models`).
    const line = stripInlineComment(raw.trimEnd(), ' #').trimEnd();
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Section header (no indent): `dependencies:`
    const sectionMatch = trimmed.match(/^(\w[\w-]*):\s*$/);
    if (sectionMatch && line.startsWith(sectionMatch[1]!)) {
      currentSection = sectionMatch[1]!;
      currentName = undefined;
      if (!sections.has(currentSection)) {
        sections.set(currentSection, new Map());
      }
      continue;
    }

    if (!currentSection) continue;

    // Dependency definition: `  package_name: ^1.0.0`
    // Or sub-properties: `    sdk: flutter` — skip these
    const depMatch = trimmed.match(/^(\S[^:]*?):\s*(.*)$/);
    if (depMatch && line.startsWith('  ') && !line.startsWith('    ')) {
      currentName = depMatch[1]!.trim();
      let constraint = yamlScalar(depMatch[2]!.trim());
      // A flow mapping carries the constraint inline: `intl: {version: ^0.19.0}`.
      if (constraint.startsWith('{')) {
        constraint = yamlScalar(/\bversion:\s*([^,}]+)/.exec(constraint)?.[1]?.trim() ?? '');
      }
      // `any` is pubspec's explicit "no constraint"; '' is either a bare
      // `name:` or a block/failed-map form whose `version:` arrives later.
      // All of them mean "any version" and use the `*` marker — they are real
      // dependencies, NOT SDK declarations (the adapter used to conflate the
      // two and drop them).
      if (constraint === '' || constraint === 'any') {
        constraint = '*';
      }
      const sec = sections.get(currentSection)!;
      sec.set(currentName, constraint);
      continue;
    }

    if (currentName && line.startsWith('    ')) {
      const sec = sections.get(currentSection);
      if (!sec) continue;
      // Block-mapping constraint: `    version: ^3.4.0`.
      if (/^version:\s*\S/.test(trimmed)) {
        const declared = yamlScalar(trimmed.slice('version:'.length).trim());
        sec.set(currentName, declared === 'any' ? '*' : declared);
      } else if (/^sdk:\s*\S/.test(trimmed)) {
        // `sdk: flutter` / `sdk: dart` — provided by an SDK, not a package.
        sec.set(currentName, `sdk:${yamlScalar(trimmed.slice('sdk:'.length).trim())}`);
      } else if (/^git:\s*/.test(trimmed))
        sec.set(currentName, `git:${yamlScalar(trimmed.slice(4).trim())}`);
      else if (/^path:\s*/.test(trimmed))
        sec.set(currentName, `path:${yamlScalar(trimmed.slice(5).trim())}`);
    }
  }

  return sections;
}

/**
 * Parse pubspec.lock to extract resolved versions.
 * pubspec.lock uses YAML format with packages as a map.
 *
 * packages:
 *   http:
 *     version: "1.2.0"
 *   path:
 *     version: "2.0.0"
 */
function parsePubspecLock(content: string): {
  versions: Map<string, string>;
  sources: Map<string, string>;
} {
  const versions = new Map<string, string>();
  // `source: hosted | path | git | sdk` — what pub actually resolved, which a
  // `dependency_overrides` entry can change from what `dependencies` declares.
  const sources = new Map<string, string>();
  const lines = content.split('\n');
  let currentPackage: string | undefined;
  let inPackages = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (!inPackages) continue;

    // Package name: `  package_name:`
    const pkgMatch = trimmed.match(/^(\S[^:]*):\s*$/);
    if (pkgMatch && raw.startsWith('  ') && !raw.startsWith('    ')) {
      currentPackage = pkgMatch[1]!.trim();
      continue;
    }

    // Version: `    version: "1.2.0"`
    if (currentPackage) {
      const sourceMatch = /^ {4}source:\s*"?(\w+)"?\s*$/.exec(raw);
      if (sourceMatch) sources.set(currentPackage, sourceMatch[1]!);
      const verMatch = trimmed.match(/^version:\s*"?([^"\s]+)"?\s*$/);
      if (verMatch && raw.startsWith('    ')) {
        versions.set(currentPackage, verMatch[1]!);
        currentPackage = undefined;
      }
    }
  }

  return { versions, sources };
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class DartAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'dart';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const root = workspaceRoot(workspace, options);
    const seen = new Set<string>();

    // Find pubspec.yaml
    const pubspecPath =
      workspace.manifests.find((m) => m.includes('pubspec.yaml')) ||
      (fileExists(join(root, 'pubspec.yaml')) ? join(root, 'pubspec.yaml') : undefined);
    if (!pubspecPath) return [];

    let content: string;
    try {
      content = readFileSync(pubspecPath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(pubspecPath);

    // Parse pubspec.yaml
    const sections = parsePubspecYaml(content);

    // Parse pubspec.lock
    const lockPath = join(root, 'pubspec.lock');
    let lockVersions = new Map<string, string>();
    let lockSources = new Map<string, string>();
    let lockEv: Evidence | undefined;
    try {
      const lockContent = readFileSync(lockPath, 'utf-8');
      ({ versions: lockVersions, sources: lockSources } = parsePubspecLock(lockContent));
      lockEv = lockfileEvidence(lockPath);
    } catch {
      // No lockfile
    }

    // Process sections
    const sectionMapping: Array<{ yamlSection: string; scope: DependencyScope }> = [
      { yamlSection: 'dependencies', scope: 'runtime' },
      { yamlSection: 'dev_dependencies', scope: 'development' },
      { yamlSection: 'dependency_overrides', scope: 'runtime' },
    ];

    for (const { yamlSection, scope } of sectionMapping) {
      const deps = sections.get(yamlSection);
      if (!deps) continue;

      for (const [name, constraint] of deps) {
        if (seen.has(name)) continue;
        seen.add(name);

        // Skip SDK-provided packages (they are the SDK itself). `*` is pubspec's
        // "any version" declaration — a real dependency, which the old check
        // discarded along with the SDK entries.
        if (constraint.startsWith('sdk:')) continue;

        const locked = lockVersions.get(name);

        // Determine status
        let status: DependencyObservation['status'] = 'current';
        let sourceType: Exclude<DependencyObservation['sourceType'], undefined> = 'registry';

        // The lock's `source` is what pub resolved — an override can turn a
        // hosted declaration into a path/git one — so it wins when present.
        const lockSource = lockSources.get(name);
        if (lockSource === 'path' || (!lockSource && constraint.startsWith('path:'))) {
          status = 'local_path';
          sourceType = 'path';
        } else if (lockSource === 'git' || (!lockSource && constraint.startsWith('git:'))) {
          status = 'git_dependency';
          sourceType = 'git';
        }

        const isRegistry = sourceType === 'registry';
        // `*` means "any version" — there is no declared version to report, and
        // it must not leak into the purl as `@*`.
        const declared = constraint === '*' ? undefined : constraint;
        // Strip caret/tilde/>= for PURL — use locked if available. A range with
        // more than one comparator (`>=0.17.0 <0.20.0`) has no single version to
        // stand in; stripping only its leading operator wrote the whole range
        // into the purl (`pkg:pub/intl@0.17.0%20%3C0.20.0`).
        const declaredVersion = declared?.replace(/^[\^~>=<\s]+/, '');
        const purlVersion =
          locked || (declaredVersion && !/\s/.test(declaredVersion) ? declaredVersion : undefined);
        // constructPurl maps the ecosystem id to the canonical PURL type
        // (`pkg:pub/…`); the raw id (`pkg:dart/…`) is unresolvable by this
        // package's own parsePurlEcosystem and by OSV advisory queries.
        const purl =
          isRegistry && purlVersion
            ? constructPurl('dart', name, purlVersion)
            : isRegistry
              ? constructPurl('dart', name)
              : undefined;

        const evidence: Evidence[] = [manifestEv];
        if (lockEv && locked) evidence.push(lockEv);

        observations.push({
          id: `dep-${workspace.id}-${name}`,
          workspaceId: workspace.id,
          ...(purl ? { purl } : {}),
          ecosystem: 'dart',
          name,
          sourceType,
          direct: true,
          scope,
          ...(constraint && constraint !== '*' ? { requested: constraint } : {}),
          ...(locked ? { locked } : {}),
          status,
          evidence,
        });
      }
    }

    return observations;
  }
}

/**
 * Default singleton instance.
 */
export const dartAdapter = new DartAdapter();
