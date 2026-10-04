import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Entry-point discovery ─────────────────────────────────────────────────

/**
 * Read a JSON file safely, returning null on any error.
 */
export function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Resolve a potentially relative path against a base directory.
 */
export function resolveAgainst(base: string, relative: string): string {
  if (path.isAbsolute(relative)) return relative;
  return path.resolve(base, relative);
}

/**
 * Walk the workspace and discover entry-point files from package.json(s).
 */
export function discoverEntryPoints(
  projectRoot: string,
  userEntryPoints: string[] | undefined,
): string[] {
  const entries = new Set<string>();

  // 1. User-provided entry points.
  if (userEntryPoints) {
    for (const ep of userEntryPoints) {
      const resolved = resolveAgainst(projectRoot, ep);
      if (fs.existsSync(resolved)) entries.add(resolved);
    }
  }

  // 2. Root package.json.
  const rootPkg = tryReadJson(path.join(projectRoot, 'package.json'));
  if (rootPkg) {
    addPkgJsonEntryPoints(projectRoot, rootPkg, entries);
  }

  // 3. Workspace packages if this is a monorepo.
  let workspaces: string[];
  if (rootPkg) {
    workspaces = extractWorkspaceGlobs(rootPkg, projectRoot);
    // Fall back to pnpm-workspace.yaml when package.json has no workspaces field
    // (pnpm's default layout for modern monorepos).
    if (workspaces.length === 0) {
      workspaces = extractPnpmWorkspaceDirs(projectRoot);
    }
  } else {
    workspaces = [];
  }
  for (const wsDir of workspaces) {
    const pkgJsonPath = path.join(wsDir, 'package.json');
    const pkg = tryReadJson(pkgJsonPath);
    if (pkg) {
      addPkgJsonEntryPoints(wsDir, pkg, entries);
      // Convention: src/index.ts
      const convention1 = path.join(wsDir, 'src', 'index.ts');
      if (fs.existsSync(convention1)) entries.add(convention1);
      const convention2 = path.join(wsDir, 'src', 'main.ts');
      if (fs.existsSync(convention2)) entries.add(convention2);
      const convention3 = path.join(wsDir, 'index.ts');
      if (fs.existsSync(convention3)) entries.add(convention3);
    }
  }

  // 4. Root conventions (for non-package projects).
  if (!rootPkg || !workspaces.length) {
    for (const name of ['src/index.ts', 'src/main.ts', 'index.ts']) {
      const convention = path.join(projectRoot, name);
      if (fs.existsSync(convention)) entries.add(convention);
    }
  }

  return [...entries];
}

/**
 * Known build-output directory names that may have equivalent source
 * directories under `src/`. Used by {@link trySourceEquivalent} to map
 * compiled paths back to their source files.
 */
export const BUILD_OUTPUT_DIRS = ['dist', 'out', 'build', 'release'] as const;

/**
 * Known build-output directory names. Used by {@link trySourceEquivalent}.
 */
export const BUILD_OUTPUT_DIR_NAMES = BUILD_OUTPUT_DIRS.map((d) => `${path.sep}${d}${path.sep}`);

/**
 * Given a resolved path that points into a build-output directory (e.g.
 * `<pkgDir>/dist/main/main.js`), try to find the corresponding source file
 * under `src/` with a `.ts` extension.
 *
 * Examples:
 *   `<pkgDir>/dist/main/main.js` → `<pkgDir>/src/main/main.ts`
 *   `<pkgDir>/out/index.mjs`     → `<pkgDir>/src/index.ts`
 *   `<pkgDir>/build/cli.cjs`     → `<pkgDir>/src/cli.ts`
 *
 * Returns the first existing source path, or null if none is found.
 */
export function trySourceEquivalent(resolved: string): string | null {
  // Normalize path separators so BUILD_OUTPUT_DIR_NAMES (built with path.sep)
  // matches regardless of how paths are stored in the index or config.
  resolved = resolved.replace(/[/\\]/g, path.sep);
  for (const marker of BUILD_OUTPUT_DIR_NAMES) {
    const idx = resolved.indexOf(marker);
    if (idx === -1) continue;

    // `marker` already includes leading and trailing path.sep (e.g. `/dist/`),
    // so `idx` points to that leading separator. The character `idx - 1` is
    // the last char of the parent directory — NOT a separator — so checking
    // `idx > 0 && resolved[idx - 1] !== path.sep` would *always* reject valid
    // matches. The leading+trailing separators in the marker already enforce
    // segment boundaries: `/my-dist/` would map to a non-existent `src/` path
    // which `fs.existsSync` catches harmlessly below.
    const base = resolved.replace(marker, `${path.sep}src${path.sep}`);

    // 1. Replace .js/.mjs/.cjs → .ts
    const candidate = base.replace(/\.(js|mjs|cjs)$/, '.ts');
    if (candidate !== base && fs.existsSync(candidate)) {
      return candidate;
    }

    // 2. Strip .d.ts first, then append .ts (catches e.g. dist/index.d.ts → src/index.ts)
    const dtsStripped = base.replace(/\.d\.ts$/, '');
    const candidateDts = dtsStripped + '.ts';
    if (candidateDts !== base && candidateDts !== candidate && fs.existsSync(candidateDts)) {
      return candidateDts;
    }

    // 3. Plain `.ts` appended when path had no JS extension (e.g. dist/main → src/main.ts).
    // Skips when branch 2 already checked this same path (no .d.ts extension).
    const candidateNoExt = base + '.ts';
    if (
      candidate !== candidateNoExt &&
      candidateNoExt !== candidateDts &&
      fs.existsSync(candidateNoExt)
    ) {
      return candidateNoExt;
    }
  }
  return null;
}

/**
 * Resolve a path string from a package.json field, add it to entries if it
 * exists, and also try the src/ equivalent when the path points to a
 * build-output directory (dist/out/build/release).
 */
export function tryAddEntryPath(pkgDir: string, rawPath: string, entries: Set<string>): void {
  const resolved = resolveAgainst(pkgDir, rawPath);
  if (fs.existsSync(resolved)) entries.add(resolved);

  // Try .ts extension (for .js/.mjs/.cjs paths).
  const tsResolved = resolved.replace(/\.(js|mjs|cjs)$/, '.ts');
  if (tsResolved !== resolved && fs.existsSync(tsResolved)) {
    entries.add(tsResolved);
  }

  // Try source equivalent under src/ (e.g. dist/main/main.js → src/main/main.ts).
  // This catches packages like Electron apps whose "main" field points to the
  // compiled output rather than the TypeScript source.
  // Runs even when the .ts sibling check above succeeded, because the build-output
  // dir might contain a stale .d.ts while the real source lives under src/.
  const srcAlt = trySourceEquivalent(resolved);
  if (srcAlt) entries.add(srcAlt);
}

export function addPkgJsonEntryPoints(
  pkgDir: string,
  pkg: Record<string, unknown>,
  entries: Set<string>,
): void {
  // main
  if (typeof pkg.main === 'string') {
    tryAddEntryPath(pkgDir, pkg.main, entries);
  }

  // bin
  const bin = pkg.bin;
  if (typeof bin === 'string') {
    tryAddEntryPath(pkgDir, bin, entries);
  } else if (bin && typeof bin === 'object') {
    for (const value of Object.values(bin)) {
      if (typeof value === 'string') {
        tryAddEntryPath(pkgDir, value, entries);
      }
    }
  }

  // types / typings
  for (const key of ['types', 'typings'] as const) {
    if (typeof pkg[key] === 'string') {
      tryAddEntryPath(pkgDir, pkg[key] as string, entries);
    }
  }

  // exports — every target string at any depth. The sugar form
  // (`"exports": "./dist/index.js"`) is a bare string, and conditions nest
  // (`{".": {"import": {"types": …, "default": …}}}`); reading only one object
  // level missed both, leaving those packages with no seed at all.
  const targets: string[] = [];
  collectExportTargets(pkg.exports, targets, 0);
  for (const target of targets) tryAddEntryPath(pkgDir, target, entries);
}

export function collectExportTargets(value: unknown, out: string[], depth: number): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExportTargets(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectExportTargets(item, out, depth + 1);
  }
}

export function expandGlobPattern(entry: string, projectRoot: string): string[] {
  const dirs: string[] = [];
  if (entry.includes('*')) {
    const base = entry.replace(/\/\*+$/, '');
    const baseDir = path.resolve(projectRoot, base);
    try {
      const children = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const child of children) {
        if (child.isDirectory()) {
          dirs.push(path.join(baseDir, child.name));
        }
      }
    } catch {
      // ignore missing dirs
    }
  } else {
    dirs.push(path.resolve(projectRoot, entry));
  }
  return dirs;
}

export function extractWorkspaceGlobs(pkg: Record<string, unknown>, projectRoot: string): string[] {
  const dirs: string[] = [];
  // Yarn also accepts `"workspaces": { "packages": [...], "nohoist": [...] }`.
  const raw = pkg.workspaces;
  const workspaces = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { packages?: unknown }).packages)
      ? (raw as { packages: unknown[] }).packages
      : undefined;
  if (workspaces) {
    for (const entry of workspaces) {
      if (typeof entry === 'string') {
        dirs.push(...expandGlobPattern(entry, projectRoot));
      }
    }
  }
  return dirs;
}

/**
 * Read workspace directories from `pnpm-workspace.yaml` when the root
 * package.json does not have a `workspaces` field (pnpm default layout).
 * Parses the `packages:` list — each entry is a glob string that gets
 * expanded the same way as package.json workspaces entries.
 *
 * Uses a line-by-line context tracker so only list items nested under
 * the `packages:` key are collected — items under other top-level keys
 * (e.g. `onlyBuiltDependencies:`) are correctly ignored.
 */
export function extractPnpmWorkspaceDirs(projectRoot: string): string[] {
  const yamlPath = path.join(projectRoot, 'pnpm-workspace.yaml');
  if (!fs.existsSync(yamlPath)) return [];

  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    const dirs: string[] = [];
    let inPackages = false;
    const lines = content.split('\n');
    // Regex for a list item: whitespace, dash, optional space, then optional
    // quoted or bare value.
    const itemRe = /^\s+-\s+"([^"]+)"|^\s+-\s+'([^']+)'|^\s+-\s+(\S+)/;
    for (const line of lines) {
      const trimmed = line.trim();

      // Detect `packages:` key at any indent level.
      if (/^packages\s*:\s*$/.test(trimmed)) {
        inPackages = true;
        continue;
      }

      // Any other top-level key (no leading whitespace) ends the packages section.
      if (inPackages && trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        if (!trimmed.startsWith('-')) {
          inPackages = false;
          continue;
        }
      }

      // Collect list items when inside the packages block.
      if (inPackages) {
        const m = itemRe.exec(line);
        if (m) {
          const entry = m[1] ?? m[2] ?? m[3];
          if (entry) {
            dirs.push(...expandGlobPattern(entry, projectRoot));
          }
        }
      }
    }
    return dirs;
  } catch {
    return [];
  }
}

// ─── Package discovery helpers ─────────────────────────────────────────────

export function findPackageEntries(projectRoot: string): Map<string, string> {
  const pkgMap = new Map<string, string>();

  // Root package
  const rootPkg = tryReadJson(path.join(projectRoot, 'package.json'));
  if (rootPkg && typeof rootPkg.name === 'string') {
    pkgMap.set(rootPkg.name, projectRoot);
  }

  // Workspace packages
  if (rootPkg) {
    let wsDirs = extractWorkspaceGlobs(rootPkg, projectRoot);
    if (wsDirs.length === 0) {
      wsDirs = extractPnpmWorkspaceDirs(projectRoot);
    }
    for (const wsDir of wsDirs) {
      const wsPkg = tryReadJson(path.join(wsDir, 'package.json'));
      if (wsPkg && typeof wsPkg.name === 'string') {
        pkgMap.set(wsPkg.name, wsDir);
      }
    }
  }

  return pkgMap;
}
