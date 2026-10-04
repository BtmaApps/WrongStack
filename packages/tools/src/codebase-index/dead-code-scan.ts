import { discoverEntryPoints, findPackageEntries } from './dead-code-entry-points.js';

export { discoverEntryPoints } from './dead-code-entry-points.js';

/**
 * `dead-code-scan` tool — find unused symbols using the codebase-index refs graph.
 *
 * How it works:
 * 1. Opens a pooled connection to the existing codebase-index SQLite store.
 * 2. Discovers entry-point symbols from package.json (bin, main, exports, types)
 *    plus conventional entry files (src/index.ts, src/main.ts, index.ts).
 * 3. BFS-traverses the reference graph from those entry points to find every
 *    symbol that is transitively reachable through imports, calls, type refs,
 *    inheritance, and implementation edges.
 * 4. Everything NOT reached is a dead-code candidate.
 *
 * Known limitations (false positives possible):
 * - Dynamic imports / `require()` with computed paths are invisible.
 * - External consumers (npm installers, CI tools) can't be seen.
 * - Config-driven registration (plugin manifests, DI containers) won't appear.
 * - Type-only exports consumed only at the type level are still marked alive
 *   because the refs graph tracks `type_ref` edges.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Tool } from '@wrongstack/core/types';
import { ToolValidationError } from '@wrongstack/core/types';
import { safeResolveProjectPath } from '../_util.js';
import { detectLang } from './languages.js';
import { MODULE_OWNER_NAME, type SymbolKind, type SymbolLang } from './schema.js';
import { codebaseIndexDirOverride, type IndexStore, indexStorePool } from './writer.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeadCodeScanInput {
  /** Project root (defaults to ctx.projectRoot). */
  projectRoot?: string | undefined;
  /**
   * Override the index directory. Normally auto-resolved from projectRoot.
   */
  indexDir?: string | undefined;
  /**
   * Additional entry-point file paths (absolute or relative to projectRoot)
   * to seed the reachability scan. These augment auto-discovered entry points.
   */
  entryPoints?: string[] | undefined;
}

export interface DeadSymbol {
  name: string;
  kind: SymbolKind;
  lang: SymbolLang;
  file: string;
  line: number;
  /** Why this symbol is considered dead. */
  reason: 'unreferenced' | 'unreferenced-export';
}

export interface DeadFile {
  file: string;
  symbolCount: number;
  lang: string;
}

export interface DeadPackage {
  package: string;
  path: string;
  fileCount: number;
}

export interface DeadCodeScanOutput {
  /** Symbols found dead. Sorted: unreferenced-export first, then by file. */
  deadSymbols: DeadSymbol[];
  /** Files where every defined symbol is dead (likely orphaned modules). */
  deadFiles: DeadFile[];
  /** Packages in the workspace with zero used symbols. */
  deadPackages: DeadPackage[];
  /** Entry points used as traversal roots. */
  entryPoints: string[];
  stats: {
    totalSymbols: number;
    alive: number;
    dead: number;
    durationMs: number;
  };
}

// ─── Tool definition ───────────────────────────────────────────────────────

export const deadCodeScanTool: Tool<DeadCodeScanInput, DeadCodeScanOutput> = {
  name: 'dead-code-scan',
  category: 'Project',
  icon: 'index',
  description:
    'Scan TypeScript/JavaScript source files for exported symbols that appear ' +
    'unused anywhere in the project. Uses the codebase-index reference graph ' +
    '(import/call/type-ref edges) to compute transitive reachability from ' +
    'package.json entry points. Requires a built codebase-index (run ' +
    '`codebase-index` first if you get no results).',
  usageHint:
    'SCANS ALL INDEXED FILES UNDER THE PROJECT ROOT:\n\n' +
    '- `projectRoot` defaults to the current project root; `indexDir` overrides the resolved index location.\n' +
    '- `entryPoints` is an array of file paths that AUGMENTS the auto-discovered entry points (package.json bin/main/exports/types plus conventional src/index.ts-style files) — it does not replace them.\n\n' +
    'The scan runs against the existing index; results are best-effort (dynamic imports, external consumers, and config-driven registration are invisible).',
  permission: 'auto',
  mutating: false,
  capabilities: ['fs.read'],
  timeoutMs: 60_000,
  inputSchema: {
    type: 'object',
    properties: {
      projectRoot: {
        type: 'string',
        description: 'Project root (defaults to ctx.projectRoot).',
      },
      indexDir: {
        type: 'string',
        description: 'Override index directory.',
      },
      entryPoints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional entry-point file paths to seed the scan.',
      },
    },
  },
  async execute(input, ctx, _execOpts) {
    const startMs = Date.now();
    // `permission: 'auto'`: model-supplied paths must stay inside the project
    // (the scan reads package.json and barrel files under them).
    const projectRoot =
      input.projectRoot !== undefined
        ? await safeResolveProjectPath(input.projectRoot, ctx)
        : (ctx.projectRoot ?? ctx.cwd ?? process.cwd());
    const indexDir = input.indexDir ?? codebaseIndexDirOverride(ctx) ?? undefined;

    let userEntryPoints: string[] | undefined;
    if (input.entryPoints) {
      userEntryPoints = [];
      for (const ep of input.entryPoints) {
        const resolved = await safeResolveProjectPath(
          path.isAbsolute(ep) ? ep : path.resolve(projectRoot, ep),
          ctx,
        );
        // A missing seed used to be dropped silently, widening the "dead" set.
        if (!fs.existsSync(resolved)) {
          throw new ToolValidationError({
            message: `dead-code-scan: entry point not found: "${ep}"`,
            field: 'entryPoints',
          });
        }
        userEntryPoints.push(resolved);
      }
    }

    const result = runDeadCodeScan(projectRoot, { indexDir, userEntryPoints });

    // An empty index reported "0 dead symbols" and a seedless scan reported
    // EVERYTHING dead — both looked like real answers.
    if (result.stats.totalSymbols === 0) {
      throw new Error(
        `dead-code-scan: the codebase index for "${projectRoot}" has no symbols. Run codebase-index, then retry.`,
      );
    }
    if (result.stats.alive === 0) {
      throw new Error(
        `dead-code-scan: no indexed entry point was found under "${projectRoot}" (package.json main/bin/exports/types or src/index.ts), so reachability cannot be computed. Pass \`entryPoints\`.`,
      );
    }

    return {
      ...result,
      stats: { ...result.stats, durationMs: Date.now() - startMs },
    };
  },
};

// ─── BFS reachability scan ────────────────────────────────────────────────

/** Languages whose symbols are data or prose; they can never be dead code. */
const NON_CODE_LANGS: ReadonlySet<SymbolLang> = new Set(['json', 'yaml', 'toml', 'md']);

interface SymbolRow {
  id: number;
  name: string;
  file: string;
  kind: string;
  line: number;
  scope: string;
}

/**
 * Languages whose parser records `obj.method()` by its receiver, not the
 * member name (resolving `.get`/`.map` by name alone would invent edges).
 * A member of a live declaration there has no edge of its own, so every
 * instance method was reported dead while its class was plainly in use.
 */
const RECEIVER_ONLY_MEMBER_CALL_LANGS: ReadonlySet<SymbolLang> = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
]);

/**
 * Try to resolve a relative module specifier (e.g. './foo', '../bar/index.js')
 * against an importing file's directory to find an indexed source file.
 *
 * Tries these extensions in order: .ts, .tsx, .js, .jsx, /index.ts, /index.tsx,
 * /index.js, /index.jsx.  Strips .js/.jsx/.mjs/.cjs → .ts/.tsx for the common pattern
 * where source is TypeScript but the import specifier references the compiled
 * output (e.g. `import { X } from './foo.js'` → resolves to `./foo.ts`).
 *
 * Returns the absolute paths of all matching indexed files, or an empty array.
 */
function resolveModulePath(
  importerPath: string,
  moduleSpecifier: string,
  indexedFiles: ReadonlySet<string>,
): string[] {
  // Only handle relative paths — bare specifiers (package names) can't be
  // resolved locally.
  if (!moduleSpecifier.startsWith('.')) return [];

  const dir = path.dirname(importerPath);
  const base = path.resolve(dir, moduleSpecifier);
  const results: string[] = [];

  // Strip common extensions → bare base so we try cross-extension equivalents.
  // Include .ts/.tsx so specifiers like `./foo.ts` are handled the same way
  // as `./foo.js`.
  const stripped = base.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  // When the original path already has one of the known extensions we try
  // below, skip the `base` iteration — `stripped` already covers all the
  // extension variants, and retrying with the original extension appended
  // (e.g. `foo.ts.ts`) would only produce pointless Set.has() misses.
  const skipBase = stripped !== base && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base);
  const candidates = skipBase ? [stripped] : [base];

  for (const candidate of candidates) {
    if (indexedFiles.has(candidate + '.ts')) results.push(candidate + '.ts');
    if (indexedFiles.has(candidate + '.tsx')) results.push(candidate + '.tsx');
    if (indexedFiles.has(candidate + '.js')) results.push(candidate + '.js');
    if (indexedFiles.has(candidate + '.jsx')) results.push(candidate + '.jsx');
    if (indexedFiles.has(candidate + '.mjs')) results.push(candidate + '.mjs');
    if (indexedFiles.has(candidate + '.cjs')) results.push(candidate + '.cjs');

    // Try /index.{ts,tsx,js,jsx,mjs,cjs}
    if (indexedFiles.has(path.join(candidate, 'index.ts')))
      results.push(path.join(candidate, 'index.ts'));
    if (indexedFiles.has(path.join(candidate, 'index.tsx')))
      results.push(path.join(candidate, 'index.tsx'));
    if (indexedFiles.has(path.join(candidate, 'index.js')))
      results.push(path.join(candidate, 'index.js'));
    if (indexedFiles.has(path.join(candidate, 'index.jsx')))
      results.push(path.join(candidate, 'index.jsx'));
    if (indexedFiles.has(path.join(candidate, 'index.mjs')))
      results.push(path.join(candidate, 'index.mjs'));
    if (indexedFiles.has(path.join(candidate, 'index.cjs')))
      results.push(path.join(candidate, 'index.cjs'));
  }

  return [...new Set(results)];
}

/**
 * Parse the specific symbol names from a named re-export statement like:
 *   export { X, Y } from './M'           → ['X', 'Y']
 *   export { X as Y, type Z } from './M' → ['X', 'Z']
 *   export type { X } from './M'         → ['X']
 *
 * Returns `null` for wildcard re-exports (`export * from './M'` or
 * `export * as X from './M'`) since those legitimately re-export all symbols.
 */
function parseNamedExportSymbols(matchText: string): string[] | null {
  const braceStart = matchText.indexOf('{');
  if (braceStart === -1) return null; // wildcard export

  const braceEnd = matchText.indexOf('}', braceStart);
  if (braceEnd === -1) return null;

  const inner = matchText.slice(braceStart + 1, braceEnd);
  const symbols: string[] = [];

  for (const part of inner.split(',')) {
    let s = part.trim();
    if (!s) continue;
    // Strip inline 'type ' modifier (e.g. "type X" → "X")
    s = s.replace(/^type\s+/, '');
    // Handle 'X as Y' — extract X (the source symbol name)
    const asIdx = s.search(/\s+as\s+/);
    if (asIdx !== -1) {
      s = s.slice(0, asIdx).trim();
    }
    if (s) symbols.push(s);
  }

  return symbols;
}

export function runDeadCodeScan(
  projectRoot: string,
  opts: {
    indexDir?: string | undefined;
    userEntryPoints?: string[] | undefined;
    // Allow injecting a store for testing.
    store?: IndexStore | undefined;
  } = {},
): DeadCodeScanOutput {
  const store = opts.store ?? indexStorePool.acquire(projectRoot, { indexDir: opts.indexDir });

  try {
    // Phase 1: load the full symbol universe (for classification, not traversal).
    const allSymbols: SymbolRow[] = store.getAllSymbols();

    // Build lookup: id → symbol
    const symbolById = new Map<number, SymbolRow>();
    for (const s of allSymbols) {
      symbolById.set(s.id, s);
    }

    // Phase 2: discover entry points and map to symbol ids.
    const discoveredFiles = discoverEntryPoints(projectRoot, opts.userEntryPoints);
    const entryFileSet = new Set(discoveredFiles.map((f) => path.resolve(f)));

    // Build a set of all indexed files for module-path resolution.
    const indexedFiles = new Set<string>();
    for (const s of allSymbols) indexedFiles.add(s.file);
    for (const fm of store.getAllFileMetas()) indexedFiles.add(fm.file);

    // Map entry files to their symbol ids.
    const seedIds = new Set<number>();
    for (const s of allSymbols) {
      if (entryFileSet.has(s.file)) {
        seedIds.add(s.id);
      }
    }

    // ── Pre-build lookups for O(1) access ───────────────────────────
    const fileToSymbolIds = new Map<string, number[]>();
    for (const s of allSymbols) {
      let byFile = fileToSymbolIds.get(s.file);
      if (!byFile) {
        byFile = [];
        fileToSymbolIds.set(s.file, byFile);
      }
      byFile.push(s.id);
    }

    // ── Recursive barrel-file scanner ─────────────────────────────────
    // (unchanged — this part needs file I/O, not graph traversal)
    const scannedBarrels = new Set<string>();
    const barrelWorkList = [...entryFileSet];
    while (barrelWorkList.length > 0) {
      const epFile = barrelWorkList.pop()!;
      if (scannedBarrels.has(epFile)) continue;
      scannedBarrels.add(epFile);

      try {
        const content = fs.readFileSync(epFile, 'utf8');
        const strippedContent = content
          .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
          .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
        const reExportRe =
          /export\s+(?:(?:type\s+)?\{[\s\S]*?\}\s+from|\*\s+as\s+\w+\s+from|\*\s+from)\s+['"]([^'"]+)['"]/g;
        for (;;) {
          const match = reExportRe.exec(strippedContent);
          if (match === null) break;
          const moduleSpec = match[1]!;
          const resolvedFiles = resolveModulePath(epFile, moduleSpec, indexedFiles);
          for (const rf of resolvedFiles) {
            const fileSyms = fileToSymbolIds.get(rf);
            if (fileSyms) {
              const namedSymbols = parseNamedExportSymbols(match[0]);
              if (namedSymbols) {
                const nameSet = new Set(namedSymbols);
                for (const sid of fileSyms) {
                  const sym = symbolById.get(sid);
                  if (sym && nameSet.has(sym.name)) seedIds.add(sid);
                }
              } else {
                for (const sid of fileSyms) seedIds.add(sid);
              }
            }
            if (!scannedBarrels.has(rf)) {
              barrelWorkList.push(rf);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'dead_code_scan_barrel_read_failed',
              message: err.message,
              file: epFile,
              timestamp: new Date().toISOString(),
            }),
          );
        }
      }
    }

    // Phase 3: CTE-based reachability scan (replaces in-memory BFS).
    // Instead of loading ALL refs into JS memory and traversing with a
    // Map<number, Set<number>>, we delegate to a native SQLite recursive CTE.
    // The CTE stays inside SQLite's optimized query engine, avoiding
    // hundreds of MB of JS heap for large monorepos.
    const alive = store.findReachableSymbolIds([...seedIds]);

    // Phase 4: classify dead symbols.
    const dead: DeadSymbol[] = [];
    const symbolsByFile = new Map<string, SymbolRow[]>();
    const usedFiles = new Set<string>();

    // Dotted scope paths of live declarations, per file ("Store", "Outer.Inner").
    const liveScopesByFile = new Map<string, Set<string>>();
    for (const s of allSymbols) {
      if (!alive.has(s.id)) continue;
      const scopePath = s.scope ? `${s.scope}.${s.name}` : s.name;
      let scopes = liveScopesByFile.get(s.file);
      if (!scopes) {
        scopes = new Set();
        liveScopesByFile.set(s.file, scopes);
      }
      scopes.add(scopePath);
    }
    const isMemberOfLiveDeclaration = (s: SymbolRow): boolean => {
      if (!s.scope) return false;
      const lang = detectLang(s.file);
      if (lang === null || !RECEIVER_ONLY_MEMBER_CALL_LANGS.has(lang)) return false;
      return liveScopesByFile.get(s.file)?.has(s.scope) ?? false;
    };

    for (const s of allSymbols) {
      if (alive.has(s.id) || isMemberOfLiveDeclaration(s)) {
        usedFiles.add(s.file);
        continue;
      }
      // Only report symbols that are exported or could be externally relevant.
      // Skip pure-internal things like parameters, local vars that can't be "dead".
      if (s.kind === 'parameter') continue;
      // A symbol-less file's ref owner is the file itself; whether the file
      // is used is the dead-files question, not a dead declaration.
      if (s.kind === 'mod' && s.name === MODULE_OWNER_NAME) continue;
      // Keys of manifests, config and docs are read by tools and humans, never
      // referenced from code: listing `package.json` fields as dead code was
      // pure noise that buried the real findings.
      const symbolLang = detectLang(s.file);
      if (symbolLang !== null && NON_CODE_LANGS.has(symbolLang)) continue;
      if (s.kind === 'let' || s.kind === 'var') {
        // Local variables are only dead if the whole file is dead — handled by deadFiles.
        continue;
      }

      const reason: DeadSymbol['reason'] = 'unreferenced';
      dead.push({
        name: s.name,
        kind: s.kind as SymbolKind,
        lang: detectLang(s.file) ?? ('ts' as SymbolLang),
        file: s.file,
        line: s.line,
        reason,
      });

      let fileSymbols = symbolsByFile.get(s.file);
      if (!fileSymbols) {
        fileSymbols = [];
        symbolsByFile.set(s.file, fileSymbols);
      }
      fileSymbols.push(s);
    }

    // Phase 5: classify dead files (all their symbols are dead).
    const deadFiles: DeadFile[] = [];
    for (const [file, syms] of symbolsByFile) {
      // `usedFiles` already holds every file with an alive symbol. Rescanning
      // the whole symbol list per file was O(files × symbols) — hundreds of
      // millions of comparisons on a large repository, against a 60 s budget.
      if (!usedFiles.has(file)) {
        deadFiles.push({
          file,
          symbolCount: syms.length,
          lang: detectLang(file) ?? 'ts',
        });
      }
    }

    // Phase 6: classify dead packages.
    // A package is dead if ALL its files have zero used symbols.
    const deadPackages: DeadPackage[] = [];
    const pkgEntries = findPackageEntries(projectRoot);
    for (const [pkgName, pkgDir] of pkgEntries) {
      const pkgFiles = allSymbols.filter(
        (s) =>
          s.file.startsWith(pkgDir + path.sep) &&
          !(s.kind === 'mod' && s.name === MODULE_OWNER_NAME),
      );
      if (pkgFiles.length === 0) continue;
      const pkgUsed = pkgFiles.filter((s) => alive.has(s.id));
      if (pkgUsed.length === 0) {
        // All files in this package are dead.
        const uniqueFiles = new Set(pkgFiles.map((s) => s.file));
        deadPackages.push({
          package: pkgName,
          path: pkgDir,
          fileCount: uniqueFiles.size,
        });
      }
    }

    // Sort: unreferenced-export first, then by file path.
    dead.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'unreferenced-export' ? -1 : 1;
      return a.file.localeCompare(b.file) || a.line - b.line;
    });

    return {
      deadSymbols: dead,
      deadFiles,
      deadPackages,
      entryPoints: discoveredFiles,
      stats: {
        totalSymbols: allSymbols.length,
        alive: alive.size,
        dead: dead.length,
        durationMs: 0,
      },
    };
  } finally {
    if (!opts.store) {
      indexStorePool.release(store);
    }
  }
}
