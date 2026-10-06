/**
 * TechStack — Python ecosystem adapter.
 *
 * Parses pyproject.toml (PEP 621), requirements.txt, and Pipfile to produce
 * DependencyObservation[] for Python workspaces.
 *
 * Supports: pip, pipenv, poetry, uv — determined by manifest/lockfile presence.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { constructPurl, normalizePypiName } from '../registry/purl.js';
import type {
  DependencyObservation,
  DependencyScope,
  EcosystemId,
  Evidence,
  Workspace,
} from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { parseTomlKeyValue } from './parse-utils.js';
import { fileExistsAsync, lockfileEvidence, manifestEvidence, workspaceRoot } from './paths.js';

// ── Helpers ───────────────────────────────────────────────────────────────

// ── Minimal TOML parser (line-based, sufficient for pyproject.toml) ───────

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
    // Array tables also end the preceding section; keep their names distinct.
    const sectionMatch = line.match(/^\[(\[[^\]]+\]|[^\]]+)\]$/);
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
 * Index of the first `]` that closes the TOML array, or -1.
 *
 * A PEP 508 requirement may carry extras — `"requests[socks]>=2.32"` — so the
 * first `]` on the line is usually part of the requirement string, not the
 * array terminator. Taking it anyway closed the array on the extras entry and
 * dropped every later dependency from the inventory. Quoted spans are skipped
 * so only an unquoted `]` terminates.
 */
function arrayCloseIndex(text: string): number {
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ']') return i;
  }
  return -1;
}

function extractTomlArray(sectionLines: string[], key: string): string[] {
  const result: string[] = [];
  let inArray = false;
  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (!inArray) {
      const match = trimmed.match(new RegExp(`^${key}\\s*=\\s*\\[`));
      if (match) {
        inArray = true;
        const rest = trimmed.slice(match[0].length);
        const closeIdx = arrayCloseIndex(rest);
        if (closeIdx >= 0) {
          const items = rest.slice(0, closeIdx).trim();
          for (const item of items.split(',')) {
            const cleaned = item.trim().replace(/^"|"$/g, '').trim();
            if (cleaned) result.push(cleaned);
          }
          inArray = false;
        }
      }
    } else {
      const closeIdx = arrayCloseIndex(trimmed);
      if (closeIdx >= 0) {
        const items = trimmed.slice(0, closeIdx).trim();
        for (const item of items.split(',')) {
          const cleaned = item.trim().replace(/^"|"$/g, '').trim();
          if (cleaned) result.push(cleaned);
        }
        inArray = false;
      } else {
        const cleaned = trimmed.replace(/,$/, '').trim().replace(/^"|"$/g, '').trim();
        if (cleaned) result.push(cleaned);
      }
    }
  }
  return result;
}

/**
 * PEP 508 direct reference: `name @ <target>`, where the target is a URL,
 * archive path, or VCS location rather than a version constraint.
 */
const PEP508_DIRECT_REFERENCE = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*@\s*(\S.*)$/;

function parsePep508(spec: string): { name: string; constraint: string | undefined } {
  // Environment markers (`; python_version < "3.10"`) are not part of the
  // version constraint.
  let s = spec.split(';')[0]!.trim();
  s = s.replace(/\[.*?\]/g, '');
  // A PEP 508 direct reference (`name @ https://…`) names the package and
  // KEEPS its target. Discarding it here made every direct reference look
  // constraint-free, so the classifier below read it as a plain registry
  // package and minted a `pkg:pypi/…` identity for a package PyPI never
  // resolves.
  const direct = PEP508_DIRECT_REFERENCE.exec(s);
  if (direct) return { name: direct[1]!, constraint: direct[2]!.trim() };
  const match = s.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*(.*)$/);
  if (!match) return { name: s, constraint: undefined };
  // PEP 508 allows the version spec in parentheses — Poetry 2 writes
  // `requests (>=2.0,<3.0)`; the parentheses are not part of the constraint.
  const constraint = match[2]
    ?.trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  return { name: match[1]!, constraint: constraint || undefined };
}

// ── pyproject.toml parser (PEP 621) ───────────────────────────────────────

function parsePyprojectDeps(
  content: string,
): Array<{ name: string; constraint: string | undefined; scope: DependencyScope }> {
  const deps: Array<{ name: string; constraint: string | undefined; scope: DependencyScope }> = [];
  const sections = parseTomlSections(content);

  const projectSection = sections.find((s) => s.name === 'project');
  if (projectSection) {
    const depSpecs = extractTomlArray(projectSection.lines, 'dependencies');
    for (const spec of depSpecs) {
      const { name, constraint } = parsePep508(spec);
      if (name) deps.push({ name, constraint, scope: 'runtime' });
    }
  }

  for (const section of sections) {
    if (section.name === 'project.optional-dependencies') {
      // Each line is: group_name = ["dep1", "dep2", ...]
      for (const line of section.lines) {
        const trimmed = line.trim();
        const groupMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\[/);
        if (groupMatch) {
          const depSpecs = extractTomlArray(section.lines, groupMatch[1]!);
          for (const spec of depSpecs) {
            const { name, constraint } = parsePep508(spec);
            if (name) deps.push({ name, constraint, scope: 'optional' });
          }
        }
      }
    }

    // PEP 735 dependency groups — where `uv add --dev` writes
    // (`[dependency-groups]` / `dev = ["pytest==8.3.3"]`). Entries are PEP 508
    // strings; `{ include-group = "…" }` tables are not dependencies.
    if (section.name === 'dependency-groups') {
      for (const line of section.lines) {
        const groupMatch = line.trim().match(/^([a-zA-Z0-9_.-]+)\s*=\s*\[/);
        if (!groupMatch) continue;
        for (const spec of extractTomlArray(section.lines, groupMatch[1]!)) {
          if (spec.startsWith('{')) continue;
          const { name, constraint } = parsePep508(spec);
          if (name) deps.push({ name, constraint, scope: 'development' });
        }
      }
    }

    if (
      section.name === 'tool.poetry.dependencies' ||
      section.name.startsWith('tool.poetry.group.')
    ) {
      const scope: DependencyScope =
        section.name === 'tool.poetry.dependencies' ? 'runtime' : 'development';
      for (const raw of section.lines) {
        const entry = parseTomlKeyValue(raw);
        if (!entry) continue;
        const name = entry.key;
        if (!name || name.toLowerCase() === 'python') continue;
        const rawValue = entry.value;
        const inlineVersion = rawValue.match(/\bversion\s*=\s*["']([^"']+)["']/)?.[1];
        const stringVersion = rawValue.match(/^["']([^"']+)["']/)?.[1];
        deps.push({ name, constraint: inlineVersion ?? stringVersion, scope });
      }
    }
  }

  return deps;
}

// ── requirements.txt parser ────────────────────────────────────────────────

function parseRequirementsTxt(
  content: string,
): Array<{ name: string; constraint: string | undefined }> {
  const deps: Array<{ name: string; constraint: string | undefined }> = [];
  for (const raw of content.split('\n')) {
    // An inline comment needs whitespace before `#` (`pkg==1  # why`); a bare
    // `#` inside a URL fragment (`#egg=`) is not one.
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    // URLs, VCS references and local paths are valid requirement lines but no
    // registry package: they became dependencies named "git", "https" or
    // "./vendor/lib".
    if (isNonRegistryRequirement(line)) continue;
    const { name, constraint } = parsePep508(line);
    if (name) deps.push({ name, constraint });
  }
  return deps;
}

/** `git+https://…`, `https://…/x.whl`, `./lib`, `../lib`, `/abs`, `C:\x`, `.`, `x.whl`. */
const NON_REGISTRY_REQUIREMENT =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:git|hg|svn|bzr)\+|\.{1,2}(?:[\\/]|$)|[\\/]|[a-z]:[\\/]|\S+\.(?:whl|zip|tar\.gz|tgz)$)/i;

/** A VCS scheme prefix (`git+`, `hg+`, `svn+`, `bzr+`) — a remote checkout. */
const VCS_REQUIREMENT = /^(?:git|hg|svn|bzr)\+/i;

/**
 * A local source: pip's `file:` URL and `-e` editable install. The old inline
 * classifier knew these two; `NON_REGISTRY_REQUIREMENT` never listed them, so
 * the unified predicate must carry them explicitly or a local reference would
 * be reclassified as a registry package.
 */
const LOCAL_PATH_REQUIREMENT = /^(?:file:|-e(?:\s|$))/i;

/**
 * THE one predicate for "this requirement is not a plain PyPI package".
 *
 * Both the requirements.txt collector and the inventory classifier derive
 * their decision from this function. They used to keep private copies of the
 * rule that disagreed: the collector tested {@link NON_REGISTRY_REQUIREMENT}
 * against the raw line while the classifier knew only `file:` / `git+` / `-e`.
 * A PEP 508 direct reference (`name @ hg+https://…`) therefore slipped past
 * both — the collector's pattern is `^`-anchored and never sees past the name,
 * and the classifier read the reference's discarded url as "no constraint" —
 * so a VCS dependency was inventoried as `sourceType: 'registry'` carrying a
 * `pkg:pypi/…` purl that no registry can resolve and no OSV query can match.
 */
function isNonRegistryRequirement(spec: string): boolean {
  const direct = PEP508_DIRECT_REFERENCE.exec(spec.trim());
  const target = (direct?.[2] ?? spec).trim();
  return LOCAL_PATH_REQUIREMENT.test(target) || NON_REGISTRY_REQUIREMENT.test(target);
}

// ── Pipfile parser ────────────────────────────────────────────────────────

function parsePipfileDeps(
  content: string,
): Array<{ name: string; constraint: string | undefined; scope: DependencyScope }> {
  const deps: Array<{ name: string; constraint: string | undefined; scope: DependencyScope }> = [];
  const sections = parseTomlSections(content);
  for (const section of sections) {
    if (section.name !== 'packages' && section.name !== 'dev-packages') continue;
    const scope: DependencyScope = section.name === 'dev-packages' ? 'development' : 'runtime';
    for (const line of section.lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*=\s*"([^"]*)"$/);
      if (match) {
        const constraint = match[2]! === '*' ? undefined : match[2]!;
        deps.push({ name: match[1]!, constraint, scope });
      }
    }
  }
  return deps;
}

function parseRequirementsLockVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    // Extras sit between the name and the pin (`Django[argon2]==4.2.0`).
    const match = line.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([^\s;#]+)/);
    if (match?.[1] && match[2]) versions.set(normalizePkgName(match[1]), match[2]);
  }
  return versions;
}

function parsePipfileLock(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  try {
    const json = JSON.parse(content) as Record<string, Record<string, { version?: string }>>;
    for (const section of ['default', 'develop']) {
      for (const [name, entry] of Object.entries(json[section] ?? {})) {
        if (entry.version?.startsWith('=='))
          versions.set(normalizePkgName(name), entry.version.slice(2));
      }
    }
  } catch {
    // Malformed lockfile.
  }
  return versions;
}

/**
 * Parse poetry.lock to extract resolved versions.
 * Format:
 * [[package]]
 * name = "flask"
 * version = "3.0.3"
 */
export function parsePoetryLock(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  let currentName: string | undefined;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const nameMatch = line.match(/^name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      currentName = nameMatch[1]!;
      continue;
    }
    const versionMatch = line.match(/^version\s*=\s*"([^"]+)"/);
    if (versionMatch && currentName) {
      versions.set(normalizePkgName(currentName), versionMatch[1]!);
      currentName = undefined;
    }
  }
  return versions;
}

/**
 * Canonical Python package identity, per PEP 503.
 *
 * Delegates to the package's single PyPI canonicalizer so the key used for
 * dedupe and lockfile resolution is byte-identical to the name embedded in the
 * purl. The previous local copy lowercased and mapped `_` → `-` but left `.`
 * untouched and never collapsed a run, so `zope.interface` and `zope-interface`
 * — one package — were treated as two: a duplicate inventory row, a lost
 * lockfile version, and a non-canonical purl OSV can never match.
 */
function normalizePkgName(name: string): string {
  return normalizePypiName(name);
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class PythonAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'python';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const root = workspaceRoot(workspace, options);
    // Identity keys are the PEP 503 names (`normalizePkgName`), matching what the
    // lockfile maps below are keyed by. Deduping on the raw manifest spelling
    // reported one package twice whenever manifests disagreed about casing or
    // separators (`Django` in pyproject.toml vs pip-compile's `django==…`), and
    // left the normalised lock key unmatched so the transitive pass re-added it.
    const seen = new Set<string>();

    const hasPyproject =
      workspace.manifests.some((m) => m.includes('pyproject.toml')) ||
      (await fileExistsAsync(join(root, 'pyproject.toml')));
    const hasRequirements =
      workspace.manifests.some((m) => m.includes('requirements.txt')) ||
      (await fileExistsAsync(join(root, 'requirements.txt')));
    const hasPipfile =
      workspace.manifests.some((m) => m.includes('Pipfile')) ||
      (await fileExistsAsync(join(root, 'Pipfile')));

    const lockfilePath = await this.detectLockfile(root);

    const allDeps: Array<{
      name: string;
      constraint: string | undefined;
      scope: DependencyScope;
      source: string;
    }> = [];
    /** PEP 503 identity — the same normalisation the lockfile maps are keyed by. */
    const alreadyCollected = (name: string): boolean =>
      allDeps.some((existing) => normalizePkgName(existing.name) === normalizePkgName(name));
    let pyprojectEv: Evidence | undefined;

    if (hasPyproject) {
      try {
        const content = await readFile(join(root, 'pyproject.toml'), 'utf-8');
        pyprojectEv = manifestEvidence(join(root, 'pyproject.toml'));
        const parsed = parsePyprojectDeps(content);
        for (const d of parsed) allDeps.push({ ...d, source: 'pyproject.toml' });
      } catch {
        /* ignore */
      }
    }

    let reqLockVersions = new Map<string, string>();
    let requirementsEv: Evidence | undefined;

    if (hasRequirements) {
      try {
        const content = await readFile(join(root, 'requirements.txt'), 'utf-8');
        requirementsEv = manifestEvidence(join(root, 'requirements.txt'));
        const parsed = parseRequirementsTxt(content);
        for (const d of parsed) {
          if (!alreadyCollected(d.name)) {
            allDeps.push({ ...d, scope: 'runtime', source: 'requirements.txt' });
          }
        }
        reqLockVersions = parseRequirementsLockVersions(content);
      } catch {
        /* ignore */
      }
    }

    if (hasPipfile) {
      try {
        const content = await readFile(join(root, 'Pipfile'), 'utf-8');
        if (!pyprojectEv) pyprojectEv = manifestEvidence(join(root, 'Pipfile'));
        const parsed = parsePipfileDeps(content);
        for (const d of parsed) {
          if (!alreadyCollected(d.name)) {
            allDeps.push({ ...d, source: 'Pipfile' });
          }
        }
      } catch {
        /* ignore */
      }
    }

    let lockEv: Evidence | undefined;
    const lockVersions = new Map(reqLockVersions);
    if (lockfilePath) {
      try {
        const lockContent = await readFile(lockfilePath, 'utf-8');
        const parsed =
          lockfilePath.endsWith('poetry.lock') || lockfilePath.endsWith('uv.lock')
            ? parsePoetryLock(lockContent)
            : parsePipfileLock(lockContent);
        for (const [name, version] of parsed) lockVersions.set(name, version);
        lockEv = lockfileEvidence(lockfilePath);
      } catch {
        /* ignore */
      }
    }

    const manifestEv = pyprojectEv || requirementsEv;

    for (const dep of allDeps) {
      const depKey = normalizePkgName(dep.name);
      if (seen.has(depKey)) continue;
      seen.add(depKey);

      const locked = lockVersions.get(normalizePkgName(dep.name));
      const isRegistry = !dep.constraint || !isNonRegistryRequirement(dep.constraint);

      // constructPurl maps the ecosystem id to the canonical PURL type
      // (`pkg:pypi/…`). The low-level buildPurl with the raw id emitted
      // `pkg:python/…` — a type this package's own parsePurlEcosystem (and
      // OSV) cannot resolve, so every Python component identity was
      // unresolvable downstream.
      const purl =
        isRegistry && locked
          ? constructPurl('python', dep.name, locked)
          : isRegistry
            ? constructPurl('python', dep.name)
            : undefined;

      const evidence: Evidence[] = [];
      if (manifestEv) evidence.push(manifestEv);
      if (lockEv && locked) evidence.push(lockEv);

      const status: DependencyObservation['status'] = isRegistry
        ? 'current'
        : dep.constraint && VCS_REQUIREMENT.test(dep.constraint)
          ? 'git_dependency'
          : 'local_path';

      observations.push({
        id: `dep-${workspace.id}-${depKey}`,
        workspaceId: workspace.id,
        ...(purl ? { purl } : {}),
        ecosystem: 'python',
        name: depKey,
        sourceType: isRegistry ? 'registry' : status === 'local_path' ? 'path' : 'git',
        direct: true,
        scope: dep.scope,
        ...(dep.constraint ? { requested: dep.constraint } : {}),
        ...(locked ? { locked } : {}),
        status,
        evidence,
      });
    }

    if (options.includeTransitive && lockEv) {
      for (const [rawName, locked] of lockVersions) {
        // Canonical identity, the SAME key the direct pass stored in `seen`.
        // The lockfile key is raw (`Django`), so testing it directly missed the
        // direct pass's canonical `django` entry and emitted a duplicate row for
        // one package — the advisory double-count this adapter must never
        // produce.
        const name = normalizePkgName(rawName);
        if (seen.has(name)) continue;
        seen.add(name);
        observations.push({
          id: `dep-${workspace.id}-${name}`,
          workspaceId: workspace.id,
          // Canonical pypi type — see the direct-deps pass above.
          purl: constructPurl('python', name, locked),
          ecosystem: 'python',
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

    return observations;
  }

  private async detectLockfile(workspaceRoot: string): Promise<string | undefined> {
    for (const file of ['Pipfile.lock', 'poetry.lock', 'uv.lock']) {
      const candidate = join(workspaceRoot, file);
      if (await fileExistsAsync(candidate)) return candidate;
    }
    return undefined;
  }
}

export const pythonAdapter = new PythonAdapter();
