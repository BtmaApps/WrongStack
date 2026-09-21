/**
 * TechStack — Rust ecosystem adapter.
 *
 * Parses Cargo.toml manifests and Cargo.lock lockfiles to produce
 * DependencyObservation[] for Rust workspaces.
 *
 * @see docs/specs/techstack-sdd.md §6 Tier A
 */

import { readFileSync } from 'node:fs';
import { parseRange, satisfiesRange } from '../policy/resolver.js';
import { buildPurl } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { parseTomlKeyValue } from './parse-utils.js';
import {
  fileExists,
  lockfileEvidence,
  manifestEvidence,
  resolveIn,
  workspaceRoot,
} from './paths.js';

// ── Helpers ───────────────────────────────────────────────────────────────

// ── Minimal TOML parser (line-based, sufficient for Cargo.toml + Cargo.lock) ──

interface TomlSection {
  readonly name: string;
  readonly lines: string[];
}

function parseTomlSections(content: string): TomlSection[] {
  const sections: TomlSection[] = [];
  let currentSection = '__header__';
  let currentLines: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || line === '') continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (currentLines.length > 0) sections.push({ name: currentSection, lines: currentLines });
      currentSection = sectionMatch[1]!;
      currentLines = [];
    } else {
      currentLines.push(raw);
    }
  }
  if (currentLines.length > 0) sections.push({ name: currentSection, lines: currentLines });
  return sections;
}

/**
 * Net bracket depth of one TOML line: `{`/`[`/`(` minus `}`/`]`/`)`, ignoring
 * bracketed text inside strings and anything after a `#` comment.
 */
function bracketDelta(line: string): number {
  let delta = 0;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote !== undefined) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') break;
    if (ch === '{' || ch === '[' || ch === '(') delta += 1;
    else if (ch === '}' || ch === ']' || ch === ')') delta -= 1;
  }
  return delta;
}

/**
 * Join physical lines into logical TOML entries.
 *
 * A valid Cargo.toml entry can span lines even as an inline table, because TOML
 * permits newlines inside an array value:
 *
 * ```toml
 * tokio = { version = "1.40", features = [
 *     "rt-multi-thread",
 * ] }
 * ```
 *
 * Read line-by-line, that first line is `{ version = "1.40", features = [` —
 * neither a complete inline table (no closing brace) nor a `key = "value"` pair
 * — so the entry was dropped and the dependency vanished from the inventory.
 */
function joinLogicalEntries(sectionLines: readonly string[]): string[] {
  const entries: string[] = [];
  let buffer = '';
  let depth = 0;
  for (const raw of sectionLines) {
    const line = raw.trim();
    if (buffer === '' && (line === '' || line.startsWith('#'))) continue;
    buffer = buffer === '' ? line : `${buffer} ${line}`;
    depth += bracketDelta(line);
    if (depth <= 0) {
      entries.push(buffer);
      buffer = '';
      depth = 0;
    }
  }
  if (buffer !== '') entries.push(buffer);
  return entries;
}

/**
 * Extract simple string key-value pairs from a TOML section.
 * Returns { name, version } for entries like `serde = "1.0"` or `serde = { version = "1.0", ... }`.
 * Handles both simple and inline-table formats, including tables whose array
 * value wraps onto later lines (joined by {@link joinLogicalEntries}).
 */
function extractTomlDeps(sectionLines: string[]): Array<{
  name: string;
  version: string | undefined;
  sourceType: 'registry' | 'path' | 'git';
}> {
  const deps: Array<{
    name: string;
    version: string | undefined;
    sourceType: 'registry' | 'path' | 'git';
  }> = [];
  for (const raw of joinLogicalEntries(sectionLines)) {
    const line = raw.trim();
    if (line.startsWith('#') || line === '') continue;
    const entry = parseTomlKeyValue(line);
    if (!entry) continue;

    // Check if it's an inline table: serde = { version = "1.0", features = [...] }
    const tableMatch = entry.value.match(/^\{\s*(.*?)\s*\}$/);
    if (tableMatch) {
      const name = entry.key;
      const inner = tableMatch[1];
      if (inner === undefined) continue;
      const versionMatch = inner.match(/version\s*=\s*"([^"]+)"/);
      const sourceType = /\bgit\s*=/.test(inner)
        ? 'git'
        : /\bpath\s*=/.test(inner)
          ? 'path'
          : 'registry';
      deps.push({ name, version: versionMatch?.[1], sourceType });
      continue;
    }

    // Simple key = "value"
    const simpleMatch = entry.value.match(/^"([^"]*)"$/);
    if (simpleMatch) {
      deps.push({ name: entry.key, version: simpleMatch[1] || undefined, sourceType: 'registry' });
    }
  }
  return deps;
}

/** Record one `[[package]]` entry, keeping every version of a repeated name. */
function recordCargoPackage(
  versions: Map<string, string[]>,
  name: string | undefined,
  version: string | undefined,
): void {
  if (!name || !version) return;
  const existing = versions.get(name);
  if (existing) existing.push(version);
  else versions.set(name, [version]);
}

/**
 * Parse Cargo.lock format for package entries.
 * Cargo.lock uses TOML format with [[package]] array entries.
 *
 * A crate name may legitimately appear SEVERAL times — syn 1.x for one
 * dependent and syn 2.x for another — and the file is written name-then-version
 * ascending, so the last entry is the highest version. Every entry is kept here;
 * {@link pickLockedVersion} decides which instance a manifest selects.
 */
function parseCargoLock(content: string): Map<string, string[]> {
  const versions = new Map<string, string[]>();
  const lines = content.split('\n');
  let currentName: string | undefined;
  let currentVersion: string | undefined;
  let inPackage = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#') || line === '') continue;

    if (line.startsWith('[[') && line.includes('package')) {
      // Save previous
      if (inPackage) recordCargoPackage(versions, currentName, currentVersion);
      currentName = undefined;
      currentVersion = undefined;
      inPackage = true;
      continue;
    }

    if (inPackage) {
      if (line.startsWith('name')) {
        const m = line.match(/^name\s*=\s*"([^"]+)"/);
        if (m) currentName = m[1]!;
      } else if (line.startsWith('version')) {
        const m = line.match(/^version\s*=\s*"([^"]+)"/);
        if (m) currentVersion = m[1]!;
      }
    }
  }

  // Save last
  if (inPackage) recordCargoPackage(versions, currentName, currentVersion);

  return versions;
}

/**
 * Translate a Cargo version requirement into the semver-range grammar the engine
 * already understands (`policy/resolver.ts`).
 *
 * Cargo's BARE form is a CARET requirement — `"1.0"` means `>=1.0.0, <2.0.0` —
 * while that grammar reads a bare version as EXACT, so this translation is what
 * makes the lock-entry selection below correct. Cargo joins conjunctions with
 * commas, the grammar with whitespace.
 *
 * @returns undefined when the requirement carries no comparable constraint
 *          (`""`, `"*"`), so the caller keeps its fallback behaviour.
 */
function cargoRequirementToRange(requirement: string): string | undefined {
  const parts = requirement
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '*');
  if (parts.length === 0) return undefined;
  return parts.map((part) => (/^\d/.test(part) ? `^${part}` : part)).join(' ');
}

/**
 * Choose the lock entry a DIRECT dependency resolved to.
 *
 * Keeping only the last entry per crate name reported a version the manifest
 * requirement cannot even select (`syn = "1.0"` → `syn 2.0.48`). Pick the lowest
 * entry satisfying the requirement, which is what Cargo's minimal-version
 * selection prefers; fall back to the historical last entry when the requirement
 * is absent, unparseable, or satisfied by nothing in the lock.
 */
function pickLockedVersion(
  candidates: readonly string[],
  requirement: string | undefined,
): string | undefined {
  const fallback = candidates[candidates.length - 1];
  if (!requirement || candidates.length < 2) return fallback;
  const range = cargoRequirementToRange(requirement);
  if (!range) return fallback;
  try {
    const parsed = parseRange(range);
    return candidates.find((candidate) => satisfiesRange(candidate, parsed)) ?? fallback;
  } catch {
    // Not expressible in the engine's range grammar — keep the fallback.
    return fallback;
  }
}

// ── Scope mapping ─────────────────────────────────────────────────────────

function scopeForCargoSection(section: string): DependencyScope {
  switch (section) {
    case 'dependencies':
      return 'runtime';
    case 'dev-dependencies':
      return 'development';
    default:
      return 'build';
  }
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class RustAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'rust';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const root = workspaceRoot(workspace, options);
    const seen = new Set<string>();
    // Every lock INSTANCE already emitted (name@version), so the transitive pass
    // can add exactly the instances the direct loop did not cover.
    const seenInstances = new Set<string>();

    // Find manifests
    const cargoTomlPath =
      workspace.manifests.find((m) => m.includes('Cargo.toml')) ||
      (fileExists(resolveIn(root, 'Cargo.toml')) ? 'Cargo.toml' : undefined);

    if (!cargoTomlPath) return [];

    const fullManifestPath = resolveIn(root, cargoTomlPath);
    let cargoContent: string;
    try {
      cargoContent = readFileSync(fullManifestPath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(fullManifestPath);

    // Find lockfile
    const cargoLockPath = resolveIn(root, 'Cargo.lock');
    let lockVersions = new Map<string, string[]>();
    let lockEv: Evidence | undefined;
    try {
      const lockContent = readFileSync(cargoLockPath, 'utf-8');
      lockVersions = parseCargoLock(lockContent);
      lockEv = lockfileEvidence(cargoLockPath);
    } catch {
      // No lockfile — that's OK
    }

    // Parse dependency sections from Cargo.toml
    const sections = parseTomlSections(cargoContent);
    const depSections = ['dependencies', 'dev-dependencies', 'build-dependencies'];

    for (const section of sections) {
      // Cargo.toml has [dependencies], [dev-dependencies], [build-dependencies]
      // Also [target.'cfg(...)'.dependencies] patterns
      const sectionName = section.name;
      let matchedScope: string | undefined;

      for (const depSec of depSections) {
        if (sectionName === depSec || sectionName.endsWith(`.${depSec}`)) {
          matchedScope = depSec;
          break;
        }
      }

      if (!matchedScope) continue;

      const scope = scopeForCargoSection(matchedScope);
      const deps = extractTomlDeps(section.lines);

      for (const dep of deps) {
        if (seen.has(dep.name)) continue;
        seen.add(dep.name);

        // Cargo.lock can hold several instances of one crate name; pick the one
        // this dependency's requirement actually selects, not the highest.
        const candidates = lockVersions.get(dep.name) ?? [];
        const locked = pickLockedVersion(candidates, dep.version) ?? dep.version;
        if (locked) seenInstances.add(`${dep.name}@${locked}`);
        const isRegistry = dep.sourceType === 'registry';

        const purl =
          isRegistry && locked
            ? buildPurl({ type: 'rust', name: dep.name, version: locked })
            : isRegistry
              ? buildPurl({ type: 'rust', name: dep.name })
              : undefined;

        const evidence: Evidence[] = [manifestEv];
        if (lockEv && locked && candidates.length > 0) evidence.push(lockEv);

        const status: DependencyObservation['status'] =
          dep.sourceType === 'git'
            ? 'git_dependency'
            : dep.sourceType === 'path'
              ? 'local_path'
              : 'current';

        observations.push({
          id: `dep-${workspace.id}-${dep.name}`,
          workspaceId: workspace.id,
          ...(purl ? { purl } : {}),
          ecosystem: 'rust',
          name: dep.name,
          sourceType: dep.sourceType,
          direct: true,
          scope,
          ...(dep.version ? { requested: dep.version } : {}),
          ...(locked ? { locked } : {}),
          status,
          evidence,
        });
      }
    }

    if (options.includeTransitive && lockEv) {
      // One row per lock INSTANCE, not per crate name. A crate legitimately
      // appears at several versions in Cargo.lock (syn 1.x for one dependent,
      // 2.x for another); deduping by name reported only the highest and hid the
      // others, so an omitted version reached neither the SBOM nor any advisory
      // query (OSV is queried per purl) — a security false negative. The id
      // carries the version only when the name holds several instances, so
      // single-instance crates keep the historical `dep-<ws>-<name>` id.
      for (const [name, versions] of lockVersions) {
        const multiple = versions.length > 1;
        for (const locked of versions) {
          const instance = `${name}@${locked}`;
          if (seenInstances.has(instance)) continue;
          seenInstances.add(instance);
          observations.push({
            id: multiple ? `dep-${workspace.id}-${name}@${locked}` : `dep-${workspace.id}-${name}`,
            workspaceId: workspace.id,
            purl: buildPurl({ type: 'rust', name, version: locked }),
            ecosystem: 'rust',
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
export const rustAdapter = new RustAdapter();
