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
import { classifyFile, isCodeFile, type PackageInfo } from './files.js';
import type { DeadCodeResolver } from './resolve.js';

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
const MAX_TEXT_BYTES = 512 * 1024;

function readText(abs: string): string | null {
  try {
    const st = fs.statSync(abs);
    if (st.size > MAX_TEXT_BYTES) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
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
      for (const f of resolver.resolveFileLike(c)) add(f, kind);
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
          // Pattern subpath: every source file the pattern can reach.
          const [prefix = '', suffix = ''] = sp.slice(2).split('*');
          for (const f of input.codeFiles) {
            const ownDir = pkg.dir ? `${pkg.dir}/` : '';
            if (!f.startsWith(ownDir)) continue;
            const rel = f.slice(ownDir.length);
            const srcRel = rel.replace(/^src\//, '');
            const stem = srcRel.replace(/\.[cm]?[jt]sx?$/, '');
            if (stem.startsWith(prefix) && (suffix === '' || `${stem}.js`.endsWith(suffix))) {
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
