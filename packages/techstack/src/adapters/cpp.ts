/**
 * TechStack — C/C++ ecosystem adapter (Tier C).
 *
 * Best-effort: parses conanfile.txt / conanfile.py for `[requires]` and
 * vcpkg.json for dependencies. No lockfile resolution; coverage='unsupported'.
 *
 * @see docs/archive/specs/techstack-sdd.md §6 Tier C
 */

import { readFileSync } from 'node:fs';
import { buildPurl } from '../registry/purl.js';
import type { DependencyObservation, DependencyScope, EcosystemId, Workspace } from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { stripBom, stripInlineComment } from './parse-utils.js';
import { manifestEvidence } from './paths.js';

interface CppDependency {
  name: string;
  version?: string | undefined;
  minimumVersion?: boolean;
  scope?: DependencyScope;
}

/**
 * A Conan reference `name/version[@user/channel][#revision]`. The user/channel
 * and the recipe revision are not part of the version; left in, they produced
 * `pkg:conan/boost@1.80.0%40conan`.
 */
function parseConanReference(reference: string): CppDependency | undefined {
  const trimmed = reference.trim();
  if (!trimmed) return undefined;
  const slash = trimmed.indexOf('/');
  if (slash < 0) return { name: trimmed };
  const version = trimmed.slice(slash + 1).replace(/[@#].*$/, '');
  return { name: trimmed.slice(0, slash), ...(version ? { version } : {}) };
}

/**
 * Parse conanfile.txt `[requires]` section.
 *
 * Sections are whole `[name]` lines. Ending the section at the next `[`
 * anywhere cut it at a version range (`openssl/[>=3.0 <4]`), dropping that
 * dependency's range and every dependency listed after it.
 */
function parseConanTxt(content: string): CppDependency[] {
  const deps: CppDependency[] = [];
  let inRequires = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const section = /^\[([\w-]+)\]$/.exec(trimmed);
    if (section) {
      inRequires = section[1] === 'requires';
      continue;
    }
    if (!inRequires || !trimmed || trimmed.startsWith('#')) continue;
    const dep = parseConanReference(trimmed);
    if (dep) deps.push(dep);
  }
  return deps;
}

/** The quoted strings of a Python value starting at `start`: `"a", "b"`, `("a", "b")`, `["a"]`. */
function quotedValuesAt(source: string, start: number): string[] {
  const values: string[] = [];
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const character = source.charAt(index);
    if (character === '"' || character === "'") {
      const end = source.indexOf(character, index + 1);
      if (end < 0) break;
      values.push(source.slice(index + 1, end));
      index = end;
    } else if (character === '(' || character === '[') {
      depth++;
    } else if (character === ')' || character === ']') {
      if (--depth <= 0) break;
    } else if (character === '\n' && depth === 0) {
      break;
    } else if (!/[\s,]/.test(character)) {
      break;
    }
  }
  return values;
}

const CONAN_REQUIREMENT_SCOPE: Readonly<Record<string, DependencyScope>> = {
  requires: 'runtime',
  test_requires: 'development',
  tool_requires: 'build',
  build_requires: 'build',
};

/**
 * Parse a conanfile.py recipe: the `requires = …` class attributes (and the
 * test/tool/build variants) and `self.requires("…")` calls. The recipe used to
 * go through the conanfile.txt parser, which looks for a `[requires]` section a
 * Python file never has, so every recipe inventoried as empty.
 */
function parseConanPy(source: string): CppDependency[] {
  const content = source
    .split('\n')
    .map((line) => stripInlineComment(line))
    .join('\n');
  const deps: CppDependency[] = [];
  const push = (kind: string, reference: string): void => {
    const dep = parseConanReference(reference);
    if (dep) deps.push({ ...dep, scope: CONAN_REQUIREMENT_SCOPE[kind] ?? 'runtime' });
  };
  for (const match of content.matchAll(
    /^[ \t]*(requires|test_requires|tool_requires|build_requires)[ \t]*=[ \t]*/gm,
  )) {
    for (const reference of quotedValuesAt(content, match.index + match[0].length)) {
      push(match[1]!, reference);
    }
  }
  for (const match of content.matchAll(
    /\bself\.(requires|test_requires|tool_requires|build_requires)\(\s*(["'])([^"']+)\2/g,
  )) {
    push(match[1]!, match[3]!);
  }
  return deps;
}

/**
 * Parse vcpkg.json `dependencies` array.
 */
function parseVcpkgJson(content: string): CppDependency[] {
  const deps: CppDependency[] = [];
  try {
    const json = JSON.parse(stripBom(content)) as {
      dependencies?: Array<string | { name: string; version?: string; 'version>='?: string }>;
    };
    for (const dep of json.dependencies ?? []) {
      if (typeof dep === 'string') {
        deps.push({ name: dep });
      } else {
        deps.push({
          name: dep.name,
          version: dep.version ?? dep['version>='],
          minimumVersion: dep['version>='] !== undefined && dep.version === undefined,
        });
      }
    }
  } catch {
    // Malformed
  }
  return deps;
}

export class CppAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'cpp';

  async inventory(
    workspace: Workspace,
    _options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const seen = new Set<string>();

    for (const manifestPath of workspace.manifests) {
      let content: string;
      try {
        content = readFileSync(manifestPath, 'utf-8');
      } catch {
        continue;
      }

      const manifestEv = manifestEvidence(manifestPath);
      let deps: CppDependency[] = [];

      if (manifestPath.endsWith('conanfile.py')) {
        deps = parseConanPy(content);
      } else if (manifestPath.includes('conanfile')) {
        deps = parseConanTxt(content);
      } else if (manifestPath.includes('vcpkg.json')) {
        deps = parseVcpkgJson(content);
      } else {
        continue;
      }

      for (const dep of deps) {
        if (seen.has(dep.name)) continue;
        seen.add(dep.name);

        // A Conan range (`[>=3.0 <4]`) is a constraint, not a version.
        const purl =
          dep.version && !dep.minimumVersion && !dep.version.startsWith('[')
            ? buildPurl({ type: 'conan', name: dep.name, version: dep.version })
            : buildPurl({ type: 'conan', name: dep.name });

        observations.push({
          id: `dep-${workspace.id}-${dep.name}`,
          workspaceId: workspace.id,
          purl,
          ecosystem: 'cpp',
          name: dep.name,
          sourceType: 'registry',
          direct: true,
          scope: dep.scope ?? 'runtime',
          ...(dep.version ? { requested: dep.version } : {}),
          // Tier C — we cannot verify current/version status
          status: 'unknown',
          evidence: [manifestEv],
        });
      }
    }

    return observations;
  }
}

export const cppAdapter = new CppAdapter();
