/**
 * TechStack — Ruby/Bundler ecosystem adapter (Tier B).
 *
 * Parses Gemfile and Gemfile.lock for direct and transitive dependencies.
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
 * Parse Gemfile for direct `gem 'name'` and `gem 'name', 'version'` calls.
 */
function parseGemfile(content: string): Array<{
  name: string;
  version?: string | undefined;
  sourceType: 'registry' | 'git' | 'path';
  scope: DependencyScope;
}> {
  const gems: Array<{
    name: string;
    version?: string | undefined;
    sourceType: 'registry' | 'git' | 'path';
    scope: DependencyScope;
  }> = [];
  const gemRegex = /gem\s+['"]([^'"]+)['"]([^\n]*)/g;
  // Bundler groups: `group :development, :test do … end` blocks (nesting adds
  // groups) and the inline `group:`/`groups:` option. A gem belongs to the
  // union; it is a development dependency only when every group it is in is
  // `development` or `test` — reporting those as runtime skewed triage.
  const enclosing: Array<readonly string[]> = [];
  // A Gemfile declares dependencies through LIVE `gem '…'` calls; commented-out
  // text is not a declaration. Scanning the raw file inventoried
  // `# gem 'nokogiri'` as a real dependency and let a trailing comment forge the
  // source type (`gem 'redis' # git: …` came out as a git dependency).
  // `stripInlineComment` already understands quotes and escapes, so a `#` inside
  // a name, version or repository URL survives.
  for (const line of content.split('\n').map((raw) => stripInlineComment(raw))) {
    if (/^\s*end\b/.test(line)) {
      enclosing.pop();
      continue;
    }
    // Every `end` closes one block, so statement blocks (`if … end`) count too.
    if (
      /\bdo\s*(?:\|[^|]*\|)?\s*$/.test(line) ||
      /^\s*(?:if|unless|case|begin|while|until|def)\b/.test(line)
    ) {
      const group = /^\s*group\b(.*)\bdo\b/.exec(line);
      enclosing.push(group ? gemGroupNames(group[1]!) : []);
      continue;
    }
    for (const match of line.matchAll(gemRegex)) {
      const name = match[1]!;
      // Preserve the existing `ruby` exclusion; Rails is an ordinary gem and
      // must remain visible to inventory and advisory enrichment.
      if (name === 'ruby') continue;
      const tail = match[2] ?? '';
      const version = /^\s*,\s*['"]([^'"]+)['"]/.exec(tail)?.[1];
      const sourceType = /\b(?:git|github):/.test(tail)
        ? 'git'
        : /\bpath:/.test(tail)
          ? 'path'
          : 'registry';
      const inline = /(?:\bgroups?:|:groups?\s*=>)\s*(\[[^\]]*\]|:\w+|['"]\w+['"])/.exec(tail)?.[1];
      const groups = [...enclosing.flat(), ...(inline ? gemGroupNames(inline) : [])];
      const scope: DependencyScope =
        groups.length > 0 && groups.every((group) => group === 'development' || group === 'test')
          ? 'development'
          : 'runtime';
      gems.push({ name, version, sourceType, scope });
    }
  }
  return gems;
}

/** `:development, :test` / `[:test]` / `'test'` → group names. */
function gemGroupNames(text: string): string[] {
  return [...text.matchAll(/:(\w+)|['"](\w+)['"]/g)].map((match) => match[1] ?? match[2]!);
}

/**
 * Parse Gemfile.lock `GEM` section for resolved versions.
 * Format: `    name (version)`.
 */
function parseGemfileLock(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  const lines = content.split('\n');
  let inSpecs = false;
  for (const line of lines) {
    if (/^(?:GEM|GIT|PATH)$/.test(line.trim())) {
      inSpecs = false;
      continue;
    }
    if (/^\s{2}specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }
    if (inSpecs && /^[A-Z]/.test(line) && !line.startsWith(' ')) {
      inSpecs = false;
      continue;
    }
    if (!inSpecs) continue;
    // Bundler indents a spec line by EXACTLY four spaces and nests that spec's
    // own requirements one level deeper (six spaces): `      rack (>= 2.2.4)`.
    // The old `^\s{4,}` matched those nested lines too, recording the gem with
    // the constraint fragment as its version (`>==`, `=`, `~>`) — and because a
    // spec's requirements are written under a later, alphabetically-later gem,
    // the fragment OVERWROTE the resolved version. A word character cannot match
    // the fifth space, so anchoring on exactly four keeps them out.
    const match = /^ {4}([\w-]+)\s+\(([^)]+)\)/.exec(line);
    if (match) {
      // A platform-specific spec is written `version-platform`
      // (`nokogiri (1.16.0-x86_64-linux)`). A RubyGems version never contains
      // `-`, so everything from it on is the platform, not part of the version.
      const version = (match[2]!.split(' ')[0] ?? match[2]!).replace(/-.*$/, '');
      versions.set(match[1]!, version);
    }
  }
  return versions;
}

export class RubyAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'ruby';

  async inventory(
    workspace: Workspace,
    _options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const gemfilePath = workspace.manifests.find((m) => m.includes('Gemfile'));
    if (!gemfilePath) return [];

    let content: string;
    try {
      content = readFileSync(gemfilePath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(gemfilePath);
    const gems = parseGemfile(content);
    const seen = new Set<string>();

    // Parse lockfile
    const lockfilePath = workspace.lockfiles.find((l) => l.includes('Gemfile.lock'));
    let lockVersions = new Map<string, string>();
    let lockEv: Evidence | undefined;
    if (lockfilePath) {
      try {
        const lockContent = readFileSync(lockfilePath, 'utf-8');
        lockVersions = parseGemfileLock(lockContent);
        lockEv = lockfileEvidence(lockfilePath);
      } catch {
        // No lockfile
      }
    }

    for (const gem of gems) {
      if (seen.has(gem.name)) continue;
      seen.add(gem.name);

      const locked = lockVersions.get(gem.name);
      const version = locked ?? gem.version;
      const purl =
        gem.sourceType === 'registry' && version
          ? buildPurl({ type: 'gem', name: gem.name, version })
          : gem.sourceType === 'registry'
            ? buildPurl({ type: 'gem', name: gem.name })
            : undefined;

      const evidence: Evidence[] = [manifestEv];
      if (lockEv && locked) evidence.push(lockEv);

      observations.push({
        id: `dep-${workspace.id}-${gem.name}`,
        workspaceId: workspace.id,
        ...(purl ? { purl } : {}),
        ecosystem: 'ruby',
        name: gem.name,
        sourceType: gem.sourceType,
        direct: true,
        scope: gem.scope,
        ...(gem.version ? { requested: gem.version } : {}),
        ...(locked ? { locked } : {}),
        status:
          gem.sourceType === 'git'
            ? 'git_dependency'
            : gem.sourceType === 'path'
              ? 'local_path'
              : 'current',
        evidence,
      });
    }

    return observations;
  }
}

export const rubyAdapter = new RubyAdapter();
