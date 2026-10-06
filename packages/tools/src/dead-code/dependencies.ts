/**
 * Unused package.json dependencies.
 *
 * A dependency is used when any code file of its package imports it (static,
 * dynamic, require, re-export, `require.resolve`), when a script of the
 * package — or, for the workspace root, of any package — runs one of its
 * binaries, or when a config file of the package names it as a string
 * (`environment: 'jsdom'`, `"extends": "@tsconfig/node20"`). Type packages and
 * peer dependencies are never reported: their use is implicit by design.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  classifyFile,
  compileIgnore,
  isCodeFile,
  owningPackage,
  type PackageInfo,
} from './files.js';
import type { DeadCodeFinding } from './types.js';

export interface DependencyScanInput {
  projectRoot: string;
  packages: readonly PackageInfo[];
  allFiles: readonly string[];
  /** Package dir → bare package names imported by its code files. */
  externalUse: ReadonlyMap<string, ReadonlySet<string>>;
  stringLiterals: (pkgDir: string) => ReadonlySet<string>;
  ignore: readonly string[];
}

/** Implicitly loaded by toolchains; reporting them is noise by construction. */
const IMPLICIT_DEPS = new Set(['tslib', '@babel/runtime', 'regenerator-runtime', 'core-js']);
/** Loaded by their host tool by convention (`coverage.provider: 'v8'` → `@vitest/coverage-v8`). */
const IMPLICIT_DEP_PATTERNS = [/^@vitest\//, /-types$/];
/**
 * Configs and stylesheets (`@import "tailwindcss"`) name dependencies as
 * strings, and components (`.vue`/`.svelte`/`.astro`) import them.
 */
const CONFIG_TEXT =
  /\.(?:json|jsonc|ya?ml|toml|css|scss|sass|less|pcss|html|vue|svelte|astro)$|(?:^|\/)\.[\w-]+rc$/i;
const MAX_CONFIG_BYTES = 256 * 1024;

function binNames(projectRoot: string, pkgDir: string, dep: string): string[] {
  for (const base of [pkgDir, '']) {
    const manifestPath = path.join(projectRoot, base, 'node_modules', dep, 'package.json');
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        bin?: unknown;
        name?: string;
      };
      if (typeof m.bin === 'string') return [dep.split('/').pop()!];
      if (m.bin && typeof m.bin === 'object') return Object.keys(m.bin);
      return [];
    } catch {
      // Not installed here; try the next base.
    }
  }
  return [dep.split('/').pop()!];
}

/** Peer dependencies of the package's other dependencies: installing them IS their use. */
function peerRequirements(
  projectRoot: string,
  pkgDir: string,
  deps: readonly string[],
): Set<string> {
  const peers = new Set<string>();
  for (const dep of deps) {
    for (const base of [pkgDir, '']) {
      try {
        const m = JSON.parse(
          fs.readFileSync(
            path.join(projectRoot, base, 'node_modules', dep, 'package.json'),
            'utf8',
          ),
        ) as { peerDependencies?: Record<string, string> };
        for (const p of Object.keys(m.peerDependencies ?? {})) peers.add(p);
        break;
      } catch {
        // Not installed at this base.
      }
    }
  }
  return peers;
}

function readSmall(abs: string): string {
  try {
    if (fs.statSync(abs).size > MAX_CONFIG_BYTES) return '';
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanUnusedDependencies(
  input: DependencyScanInput,
): Array<Omit<DeadCodeFinding, 'id'>> {
  const { projectRoot, packages } = input;
  const ignored = compileIgnore(input.ignore);
  const out: Array<Omit<DeadCodeFinding, 'id'>> = [];

  const allScripts = packages
    .flatMap((p) => Object.values((p.manifest.scripts as Record<string, unknown>) ?? {}))
    .filter((s): s is string => typeof s === 'string')
    .join('\n');

  // Config text per package: non-code configs plus tool-role code files.
  const configText = new Map<string, string[]>();
  for (const rel of input.allFiles) {
    const isConfig = isCodeFile(rel) ? classifyFile(rel) === 'tool' : CONFIG_TEXT.test(rel);
    if (!isConfig || rel.endsWith('package.json') || /lock\.|\.lock$/.test(rel)) continue;
    const dir = owningPackage(packages, rel)?.dir ?? '';
    const list = configText.get(dir) ?? [];
    list.push(readSmall(path.join(projectRoot, rel)));
    configText.set(dir, list);
  }

  // Root scripts orchestrate every package (`scripts/package-desktop.mjs` runs
  // the desktop app's electron-builder), and root devDependencies are on every
  // package's PATH — so root literals count for all, and all count for root.
  const rootLiterals = input.stringLiterals('');
  const everyLiteral = new Set<string>();
  for (const pkg of packages) for (const l of input.stringLiterals(pkg.dir)) everyLiteral.add(l);
  const basenamesByDir = new Map<string, string[]>();
  for (const rel of input.allFiles) {
    const dir = owningPackage(packages, rel)?.dir ?? '';
    const list = basenamesByDir.get(dir) ?? [];
    list.push(path.posix.basename(rel).toLowerCase());
    basenamesByDir.set(dir, list);
  }

  for (const pkg of packages) {
    const manifestFile = pkg.dir ? `${pkg.dir}/package.json` : 'package.json';
    const used = input.externalUse.get(pkg.dir) ?? new Set<string>();
    const literals =
      pkg.dir === '' ? everyLiteral : new Set([...input.stringLiterals(pkg.dir), ...rootLiterals]);
    const basenames = basenamesByDir.get(pkg.dir) ?? [];
    const scripts =
      pkg.dir === ''
        ? allScripts
        : Object.values((pkg.manifest.scripts as Record<string, unknown>) ?? {})
            .filter((s): s is string => typeof s === 'string')
            .join('\n');
    const configs = (configText.get(pkg.dir) ?? []).join('\n');
    const declared = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((f) =>
      Object.keys((pkg.manifest[f] as Record<string, unknown>) ?? {}),
    );
    const peers = peerRequirements(projectRoot, pkg.dir, declared);

    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      const deps = pkg.manifest[field];
      if (!deps || typeof deps !== 'object') continue;
      for (const dep of Object.keys(deps)) {
        if (dep.startsWith('@types/') || IMPLICIT_DEPS.has(dep)) continue;
        if (IMPLICIT_DEP_PATTERNS.some((re) => re.test(dep))) continue;
        if (ignored(dep) || used.has(dep) || peers.has(dep)) continue;
        if ([...literals].some((l) => l === dep || l.startsWith(`${dep}/`))) continue;
        const quoted = new RegExp(`["'\`]${escapeRe(dep)}(?:["'\`/])`);
        if (quoted.test(configs)) continue;
        // `electron-builder.yml`, `.prettierrc`, `knip.config.ts`: the tool's own config file.
        const short = dep.split('/').pop()!.toLowerCase();
        if (
          basenames.some(
            (b) => b.startsWith(`${short}.`) || b === `.${short}rc` || b.startsWith(`.${short}rc.`),
          )
        ) {
          continue;
        }
        const bins = binNames(projectRoot, pkg.dir, dep);
        const inScripts = [dep, ...bins].some((b) =>
          new RegExp(`(?:^|[\\s;&|(/"'=])${escapeRe(b)}(?=$|[\\s;&|)"':@])`, 'm').test(scripts),
        );
        if (inScripts) continue;
        out.push({
          category: 'unused-dependency',
          confidence: field === 'dependencies' ? 'medium' : 'low',
          file: manifestFile,
          name: dep,
          kind: field,
          package: pkg.name,
          reason: `Listed in ${field} but no file of ${pkg.name} imports it, no script runs it and no config names it.`,
          fix: 'remove-dependency',
        });
      }
    }
  }
  return out;
}
