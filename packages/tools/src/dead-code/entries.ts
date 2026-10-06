/**
 * Entry-point discovery: the roots a dead-code reachability walk starts from.
 *
 * A file is an entry when something OUTSIDE the import graph loads it:
 * package.json (`exports`, `main`, `bin`, scripts), an HTML `<script src>`, a
 * CI workflow or other config naming its path, a tool convention
 * (`vite.config.ts`), or a shebang. Documentation never makes an entry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyFile, isCodeFile, owningPackage, type PackageInfo } from './files.js';
import { BUILD_DIRS, type DeadCodeResolver } from './resolve.js';

export type EntryKind =
  | 'package-public'
  | 'package-bin'
  | 'package-script'
  | 'html'
  | 'config-reference'
  | 'tool'
  | 'shebang'
  | 'convention'
  | 'user';

export interface EntryInfo {
  file: string;
  kinds: Set<EntryKind>;
}

/** Non-code text files whose path references create entries. */
const CONFIG_TEXT_FILE =
  /(?:^|\/)(?:[^/]+\.ya?ml|[^/]+\.toml|Dockerfile[^/]*|Makefile|Procfile|[^/]+\.sh|[^/]+\.ps1|\.husky\/[^/]+|[^/]+\.json|\.[\w-]+rc)$/i;
/** Data JSON that never names code files (and can be large). */
const SKIP_TEXT_FILE =
  /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]*\.lock|locales?\/|i18n\/|coverage[^/]*\.json|[^/]*\.min\.json)/i;
const PATH_TOKEN =
  /(?:^|[\s"'`=(,:[])((?:\.{1,2}\/|\/)?[\w@.~-][\w@.~/-]*\.(?:[cm]?[jt]sx?))(?=$|[\s"'`),;\]:])/gm;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
/** Single-file components whose `<script>` blocks import modules. */
export const SFC_FILE = /\.(?:vue|svelte|astro)$/i;
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const SFC_IMPORT =
  /\bfrom\s*(['"])([^'"\n]+)\1|\bimport\s*(['"])([^'"\n]+)\3|\bimport\s*\(\s*(['"])([^'"\n]+)\5\s*\)/g;
const MAX_TEXT_BYTES = 512 * 1024;

/** Module specifiers imported by a component's `<script>` blocks (Astro: its `---` frontmatter too). */
export function sfcImportSpecs(text: string): string[] {
  const code: string[] = [];
  for (const m of text.matchAll(SCRIPT_BLOCK)) code.push(m[1] ?? '');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (frontmatter) code.push(frontmatter[1] ?? '');
  const specs = new Set<string>();
  for (const block of code) {
    for (const m of block.matchAll(SFC_IMPORT)) specs.add((m[2] ?? m[4] ?? m[6])!);
  }
  return [...specs];
}

function readText(abs: string): string | null {
  try {
    const st = fs.statSync(abs);
    if (st.size > MAX_TEXT_BYTES) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/** Every string in an `exports` value (conditions and fallback arrays included). */
function stringTargets(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => stringTargets(v, depth + 1));
  if (typeof value === 'object')
    return Object.values(value).flatMap((v) => stringTargets(v, depth + 1));
  return [];
}

/** Package-relative paths a source file may be published as: itself, or built into a build dir. */
function builtSpellings(rel: string): string[] {
  const stem = rel.replace(/\.[cm]?[jt]sx?$/, '');
  const stems = [stem, ...BUILD_DIRS.map((dir) => `${dir}/${stem.replace(/^src\//, '')}`)];
  const ext = rel.slice(stem.length);
  return stems.flatMap((s) => [`${s}${ext}`, `${s}.js`, `${s}.mjs`, `${s}.cjs`, `${s}.d.ts`]);
}

export function collectPathTokens(text: string): string[] {
  const out: string[] = [];
  PATH_TOKEN.lastIndex = 0;
  for (;;) {
    const m = PATH_TOKEN.exec(text);
    if (m === null) break;
    out.push(m[1]!);
  }
  return out;
}

export interface EntryDiscoveryInput {
  projectRoot: string;
  allFiles: readonly string[];
  codeFiles: readonly string[];
  packages: readonly PackageInfo[];
  resolver: DeadCodeResolver;
  userEntries: readonly string[];
  matchesUserEntry: (rel: string) => boolean;
  /** The file starts with `#!` — it is executed directly. */
  isShebang: (rel: string) => boolean;
}

export function discoverEntries(input: EntryDiscoveryInput): Map<string, EntryInfo> {
  const { projectRoot, resolver, packages } = input;
  const entries = new Map<string, EntryInfo>();
  const add = (file: string, kind: EntryKind): void => {
    let info = entries.get(file);
    if (!info) {
      info = { file, kinds: new Set() };
      entries.set(file, info);
    }
    info.kinds.add(kind);
  };
  const addPathRef = (fromDir: string, token: string, kind: EntryKind): void => {
    const clean = token.replace(/^\.\//, '');
    const candidates = token.startsWith('/')
      ? [clean.slice(1)]
      : [path.posix.join(fromDir, clean), clean];
    for (const c of candidates) {
      const hits = resolver.resolveFileLike(c);
      for (const f of hits) add(f, kind);
      if (hits.length > 0) continue;
      // `node dist/worker.js` names build output: credit the source it is built from.
      const owner = owningPackage(packages, c);
      const ownDir = owner?.dir ?? '';
      if (ownDir && !c.startsWith(`${ownDir}/`)) continue;
      for (const f of resolver.sourceForPackageTarget(
        ownDir,
        ownDir ? c.slice(ownDir.length + 1) : c,
      ))
        add(f, kind);
    }
  };

  // ── package.json ──────────────────────────────────────────────────────
  for (const pkg of packages) {
    const m = pkg.manifest;
    const publicTargets = new Set<string>();
    const exportsField = m.exports;
    if (exportsField !== undefined) {
      const subpaths =
        typeof exportsField === 'object' && exportsField !== null && !Array.isArray(exportsField)
          ? Object.keys(exportsField).filter((k) => k.startsWith('.'))
          : [];
      if (subpaths.length === 0) subpaths.push('.');
      for (const sp of subpaths) {
        if (sp === './package.json') continue;
        if (sp.includes('*')) {
          // Pattern subpath: every source file the pattern can reach — through
          // its public key AND through the build paths it maps to
          // (`"./features/*": "./dist/feat/*.js"` publishes `src/feat/*`).
          const [prefix = '', suffix = ''] = sp.slice(2).split('*');
          const targetPatterns = stringTargets((exportsField as Record<string, unknown>)[sp]).map(
            (t) => t.replace(/^\.\//, '').split('*') as [string, string?],
          );
          for (const f of input.codeFiles) {
            const ownDir = pkg.dir ? `${pkg.dir}/` : '';
            if (!f.startsWith(ownDir)) continue;
            const rel = f.slice(ownDir.length);
            const srcRel = rel.replace(/^src\//, '');
            const stem = srcRel.replace(/\.[cm]?[jt]sx?$/, '');
            if (stem.startsWith(prefix) && (suffix === '' || `${stem}.js`.endsWith(suffix))) {
              publicTargets.add(f);
              continue;
            }
            const built = builtSpellings(rel);
            if (
              targetPatterns.some(
                ([tPrefix, tSuffix]) =>
                  tSuffix !== undefined &&
                  built.some(
                    (b) =>
                      b.length > tPrefix.length + tSuffix.length &&
                      b.startsWith(tPrefix) &&
                      b.endsWith(tSuffix),
                  ),
              )
            ) {
              publicTargets.add(f);
            }
          }
          continue;
        }
        for (const f of resolver.resolvePackageSubpath(pkg, sp === '.' ? '' : sp.slice(2))) {
          publicTargets.add(f);
        }
      }
    }
    if (exportsField === undefined) {
      for (const f of resolver.resolvePackageSubpath(pkg, '')) publicTargets.add(f);
    }
    for (const f of publicTargets) add(f, 'package-public');

    const bin = m.bin;
    const binTargets =
      typeof bin === 'string'
        ? [bin]
        : bin && typeof bin === 'object'
          ? Object.values(bin).filter((v): v is string => typeof v === 'string')
          : [];
    for (const target of binTargets) {
      const clean = target.replace(/^\.\//, '');
      const files = resolver.resolveFileLike(pkg.dir ? `${pkg.dir}/${clean}` : clean);
      for (const f of files) add(f, 'package-bin');
      for (const f of resolver.resolvePackageSubpath(
        { ...pkg, manifest: { ...m, exports: undefined, main: target } },
        '',
      )) {
        add(f, 'package-bin');
      }
    }

    const scripts = m.scripts;
    if (scripts && typeof scripts === 'object') {
      for (const cmd of Object.values(scripts)) {
        if (typeof cmd !== 'string') continue;
        for (const token of collectPathTokens(cmd)) addPathRef(pkg.dir, token, 'package-script');
      }
    }
  }

  // ── Non-code text: HTML script tags, CI/config path references ────────
  for (const rel of input.allFiles) {
    if (isCodeFile(rel) || SKIP_TEXT_FILE.test(rel)) continue;
    const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    if (SFC_FILE.test(rel)) {
      // Components are not parsed as code, but their <script> imports are real:
      // what they import is loaded (kept alive like an HTML script tag).
      const text = readText(path.join(projectRoot, rel));
      if (!text) continue;
      for (const spec of sfcImportSpecs(text)) {
        const res = resolver.resolve(rel, spec);
        if (res.type === 'file') for (const f of res.files) add(f, 'html');
      }
      continue;
    }
    if (/\.html?$/i.test(rel)) {
      const text = readText(path.join(projectRoot, rel));
      if (!text) continue;
      SCRIPT_SRC.lastIndex = 0;
      for (;;) {
        const m = SCRIPT_SRC.exec(text);
        if (m === null) break;
        const src = m[1]!;
        if (/^(?:https?:)?\/\//i.test(src)) continue;
        addPathRef(dir, src.startsWith('/') ? src.slice(1) : src, 'html');
        if (src.startsWith('/')) addPathRef(dir, `./${src.slice(1)}`, 'html');
      }
      continue;
    }
    if (rel.endsWith('/package.json') || rel === 'package.json') continue;
    if (!CONFIG_TEXT_FILE.test(rel)) continue;
    const text = readText(path.join(projectRoot, rel));
    if (!text) continue;
    // A workflow runs from the repo root; other configs from their own dir.
    const fromDir = rel.startsWith('.github/') ? '' : dir;
    for (const token of collectPathTokens(text)) addPathRef(fromDir, token, 'config-reference');
  }

  // ── Code files: tool conventions, shebangs, user globs ─────────────────
  for (const rel of input.codeFiles) {
    if (classifyFile(rel) === 'tool') add(rel, 'tool');
    if (input.matchesUserEntry(rel)) add(rel, 'user');
    if (input.isShebang(rel)) add(rel, 'shebang');
  }
  for (const ue of input.userEntries) {
    if (ue.includes('*')) continue;
    for (const f of resolver.resolveFileLike(ue)) add(f, 'user');
  }

  // ── Packages with no explicit entry: conventional names ────────────────
  for (const pkg of packages) {
    const prefix = pkg.dir ? `${pkg.dir}/` : '';
    const hasEntry = [...entries.keys()].some((f) => f.startsWith(prefix) && pkg.dir !== '');
    if (hasEntry) continue;
    for (const name of [
      'src/index',
      'src/main',
      'index',
      'main',
      'src/cli',
      'src/server',
      'server',
      'app',
    ]) {
      for (const f of resolver.resolveFileLike(`${prefix}${name}`)) add(f, 'convention');
    }
  }

  return entries;
}
