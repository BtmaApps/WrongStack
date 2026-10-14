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
import { stripInlineComment } from './parse-utils.js';
import { lockfileEvidence, manifestEvidence } from './paths.js';

/**
 * Parse mix.exs `defp deps do` block for `{:name, "version"}` tuples.
 */
function parseMixExsDeps(content: string): Array<{
  name: string;
  version?: string | undefined;
  hexPackage?: string | undefined;
  sourceType: 'registry' | 'git' | 'path';
  scope: DependencyScope;
}> {
  const deps: Array<{
    name: string;
    version?: string | undefined;
    hexPackage?: string | undefined;
    sourceType: 'registry' | 'git' | 'path';
    scope: DependencyScope;
  }> = [];
  // A `# {:old, "~> 1.0"}` line is a comment, not a declaration.
  const live = content
    .split('\n')
    .map((line) => stripInlineComment(line))
    .join('\n');
  // Match: {:name, "version"} or {:name, "~> x.y"} or {:name, github: "..."} or {:name, path: "..."}
  const depRegex = /\{:(\w+),\s*([^}]+)\}/g;
  for (const match of live.matchAll(depRegex)) {
    const name = match[1];
    const value = match[2];
    if (!name || !value) continue;
    const version = /^\s*["']([^"']+)["']/.exec(value)?.[1];
    // `github:` is Mix shorthand for a git source; `in_umbrella: true` is a
    // sibling umbrella app on disk. Neither comes from Hex.
    const sourceType = /\b(?:git|github):/.test(value)
      ? 'git'
      : /\bpath:|\bin_umbrella:\s*true\b/.test(value)
        ? 'path'
        : 'registry';
    // `only: :test` / `only: [:dev, :test]` limits the dep to those envs.
    const only = /\bonly:\s*(\[[^\]]*\]|:\w+)/.exec(value)?.[1];
    const envs = only ? [...only.matchAll(/:(\w+)/g)].map((env) => env[1]) : [];
    const scope: DependencyScope =
      envs.length > 0 && envs.every((env) => env === 'dev' || env === 'test')
        ? 'development'
        : 'runtime';
    // `hex: :package` names the Hex package when it differs from the app name.
    const hexMatch = /\bhex:\s*(?::(\w+)|["']([^"']+)["'])/.exec(value);
    const hexPackage = hexMatch?.[1] ?? hexMatch?.[2];
    deps.push({ name, version, hexPackage, sourceType, scope });
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
 *
 * The map is keyed by APP name; the tuple's second element is the Hex PACKAGE,
 * which differs for a `hex: :package` alias and is the name the purl needs.
 */
function parseMixLock(content: string): Map<string, { version: string; hexPackage: string }> {
  const versions = new Map<string, { version: string; hexPackage: string }>();
  const lockRegex = /["']([\w-]+)["']\s*(?::|=>)\s*\{:hex,\s*:([\w-]+),\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(lockRegex)) {
    versions.set(match[1]!, { hexPackage: match[2]!, version: match[3]! });
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
    let lockVersions = new Map<string, { version: string; hexPackage: string }>();
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

      const lockEntry = lockVersions.get(dep.name);
      const locked = lockEntry?.version;
      // Without a lock pin only an exact `"1.4.1"` is a version; a requirement
      // (`~> 1.7.0`, `>= 1.14.0 and < 2.0.0`) is not, and leaked into the purl.
      const version =
        locked ?? (dep.version && /^\d[\w.+-]*$/.test(dep.version) ? dep.version : undefined);
      // The purl names the Hex package, which a `hex:` alias renames; the app
      // name purl'd an unrelated (or nonexistent) package OSV never matched.
      const hexName = lockEntry?.hexPackage ?? dep.hexPackage ?? dep.name;
      const purl =
        dep.sourceType === 'registry' && version
          ? buildPurl({ type: 'hex', name: hexName, version })
          : dep.sourceType === 'registry'
            ? buildPurl({ type: 'hex', name: hexName })
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
        scope: dep.scope,
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
