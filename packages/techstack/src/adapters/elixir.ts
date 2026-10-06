/**
 * TechStack — Elixir/Hex ecosystem adapter (Tier B).
 *
 * Parses mix.exs for direct dependencies and mix.lock for resolved versions.
 * Partial support — no registry API; OSV-only advisory enrichment.
 *
 * @see docs/archive/specs/techstack-sdd.md §6 Tier B
 */

import { readFileSync } from 'node:fs';
import { buildPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { lockfileEvidence, manifestEvidence } from './paths.js';

/**
 * Parse mix.exs `defp deps do` block for `{:name, "version"}` tuples.
 */
function parseMixExsDeps(content: string): Array<{
  name: string;
  version?: string | undefined;
  sourceType: 'registry' | 'git' | 'path';
}> {
  const deps: Array<{
    name: string;
    version?: string | undefined;
    sourceType: 'registry' | 'git' | 'path';
  }> = [];
  // Match: {:name, "version"} or {:name, "~> x.y"} or {:name, github: "..."} or {:name, path: "..."}
  const depRegex = /\{:(\w+),\s*([^}]+)\}/g;
  for (const match of content.matchAll(depRegex)) {
    const name = match[1];
    const value = match[2];
    if (!name || !value) continue;
    const version = /^\s*["']([^"']+)["']/.exec(value)?.[1];
    const sourceType = /\bgit:/.test(value) ? 'git' : /\bpath:/.test(value) ? 'path' : 'registry';
    deps.push({ name, version, sourceType });
  }
  return deps;
}

/**
 * Parse mix.lock for resolved hex versions.
 *
 * `mix.lock` is an Elixir MAP LITERAL, and Mix writes it in colon form:
 *   "phoenix": {:hex, :phoenix, "1.7.14", "hash", [:mix], [...], "hexpm", "hash2"}
 * The previous pattern required `=>` as the key/value separator, which Mix
 * never emits, so the regex never matched a real lockfile: every Hex package
 * came back with `locked === undefined`, no lockfile evidence, and a purl that
 * fell back to the `mix.exs` CONSTRAINT — `pkg:hex/phoenix@~> 1.7.0`, an
 * identifier with a requirement operator where a version belongs.
 *
 * Both map separators are accepted: Mix emits `key: value`, but a map literal
 * may equally be written `key => value`, and a lockfile using that form is
 * still valid Elixir. Narrowing to the colon alone would silently stop
 * resolving versions for those lockfiles.
 *
 * Only `:hex` entries carry a registry version; git/path sources in the lock
 * are skipped so they cannot masquerade as a resolved Hex release.
 */
function parseMixLock(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  const lockRegex = /["']([\w-]+)["']\s*(?::|=>)\s*\{:hex,\s*:[\w-]+,\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(lockRegex)) {
    versions.set(match[1]!, match[2]!);
  }
  return versions;
}

export class ElixirAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'elixir';

  async inventory(
    workspace: Workspace,
    _options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const mixExsPath = workspace.manifests.find((m) => m.includes('mix.exs'));
    if (!mixExsPath) return [];

    let content: string;
    try {
      content = readFileSync(mixExsPath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(mixExsPath);
    const deps = parseMixExsDeps(content);
    const seen = new Set<string>();

    // Parse lockfile
    const lockfilePath = workspace.lockfiles.find((l) => l.includes('mix.lock'));
    let lockVersions = new Map<string, string>();
    let lockEv: Evidence | undefined;
    if (lockfilePath) {
      try {
        const lockContent = readFileSync(lockfilePath, 'utf-8');
        lockVersions = parseMixLock(lockContent);
        lockEv = lockfileEvidence(lockfilePath);
      } catch {
        // No lockfile
      }
    }

    for (const dep of deps) {
      if (seen.has(dep.name)) continue;
      seen.add(dep.name);

      const locked = lockVersions.get(dep.name);
      const version = locked ?? dep.version;
      const purl =
        dep.sourceType === 'registry' && version
          ? buildPurl({ type: 'hex', name: dep.name, version })
          : dep.sourceType === 'registry'
            ? buildPurl({ type: 'hex', name: dep.name })
            : undefined;

      const evidence: Evidence[] = [manifestEv];
      if (lockEv && locked) evidence.push(lockEv);

      observations.push({
        id: `dep-${workspace.id}-${dep.name}`,
        workspaceId: workspace.id,
        ...(purl ? { purl } : {}),
        ecosystem: 'elixir',
        name: dep.name,
        sourceType: dep.sourceType,
        direct: true,
        scope: 'runtime' as DependencyScope,
        ...(dep.version ? { requested: dep.version } : {}),
        ...(locked ? { locked } : {}),
        status:
          dep.sourceType === 'git'
            ? 'git_dependency'
            : dep.sourceType === 'path'
              ? 'local_path'
              : 'current',
        evidence,
      });
    }

    return observations;
  }
}

export const elixirAdapter = new ElixirAdapter();
