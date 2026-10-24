/**
 * Regression guard for the zero-statement coverage ratchet.
 *
 * `scripts/check-zero-coverage.mjs` fails the build when a file inside the
 * root coverage scope has statements but zero coverage. That happens when a
 * package's source files are only ever reached through a PACKAGE SPECIFIER
 * (`@wrongstack/pkg/sub`) that resolves to the built `dist/` output instead of
 * the source: the source file is then never instrumented, never executed, and
 * the ratchet reports it as uncovered even though the package is tested.
 *
 * This happened on 2026-10-24. Extracting `packages/primitives` left the
 * `@wrongstack/primitives` specifiers resolving to `dist/`, so eight of its
 * source files were reported as zero-statement and the Test job failed. The
 * fix was a source alias in `scripts/vitest-core-aliases.mjs`; this test is
 * what stops the next extraction from reintroducing the same gap.
 *
 * The contract encoded here is the ratchet's actual trigger:
 *
 *   1. the file is inside the root coverage scope (the `include` minus the
 *      `exclude` globs of the root vitest config — this is why package
 *      barrels and type-only directories are exempt),
 *   2. the file has runtime statements (the ratchet only reports files whose
 *      summary entry has `statements.total > 0`, so a type-only module can
 *      never be reported),
 *   3. the file is reachable from an entry point that a package specifier
 *      resolves to, so the specifier decides whether it loads from source or
 *      from `dist/`,
 *   4. no test in the repository loads the file through a relative import, so
 *      nothing in the suite can load it from source, and
 *   5. the package has no source alias, so the specifier resolves to `dist/`.
 *
 * A package is safe when it is source-aliased (the root vitest alias map,
 * which already folds in the `scripts/vitest-core-aliases.mjs` entries) or
 * when it has no file meeting all five conditions.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const isFile = (candidate: string): boolean =>
  existsSync(candidate) && statSync(candidate).isFile();
const isDir = (candidate: string): boolean =>
  existsSync(candidate) && statSync(candidate).isDirectory();

function walk(dir: string, out: string[] = []): string[] {
  if (!isDir(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(file);
  }
  return out;
}

/** Value imports of a source file (type-only imports are erased at runtime). */
function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  const staticImport =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(staticImport)) specifiers.push(match[1] as string);
  for (const match of source.matchAll(dynamicImport)) specifiers.push(match[1] as string);
  return specifiers;
}

/** Resolve a relative specifier to the source file it points at. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => isFile(candidate)) ?? null;
}

/** Remove comments and string/template literal contents from a source file. */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i] as string;
    if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

/** Split a source file into its top-level statements. */
function topLevelStatements(source: string): string[] {
  const stripped = stripCommentsAndStrings(source);
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of stripped) {
    current += char;
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') depth -= 1;
    if (depth === 0 && (char === ';' || char === '}')) {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim() !== '') statements.push(current);
  return statements.map((statement) => statement.trim()).filter((statement) => statement !== '');
}

/**
 * True when a module compiles to at least one runtime statement.
 *
 * The ratchet only reports files whose coverage summary entry has
 * `statements.total > 0 && statements.covered === 0`, so a module that
 * compiles to nothing — a type-only file, which is all interfaces and type
 * aliases — can never be reported, however it is resolved.
 */
function hasRuntimeStatements(file: string): boolean {
  for (const statement of topLevelStatements(readFileSync(file, 'utf8'))) {
    if (/^(?:export\s+)?declare\b/.test(statement)) continue;
    if (/^(?:export\s+)?(?:interface|type)\s/.test(statement)) continue;
    if (/^import\s+type\b/.test(statement)) continue;
    if (/^export\s+type\s*\{/.test(statement)) continue;
    if (/^export\s*\{\s*type\s/.test(statement)) continue;
    if (/^export\s*\{/.test(statement)) {
      // A value re-export keeps a runtime binding.
      return true;
    }
    if (/^export\s+\*/.test(statement)) return true;
    if (/^import\b/.test(statement)) continue;
    if (
      /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:const|let|var|function|class|enum|namespace)\b/.test(
        statement,
      )
    ) {
      return true;
    }
    if (/^export\s+default\b/.test(statement)) return true;
    return true;
  }
  return false;
}

/** Glob matcher for the coverage include/exclude globs of the root config. */
function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i] as string;
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if (char === '{') {
      const close = pattern.indexOf('}', i);
      const options = pattern.slice(i + 1, close).split(',');
      source += `(?:${options
        .map((option) => option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')})`;
      i = close;
      continue;
    }
    source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

interface WorkspacePackage {
  name: string;
  src: string;
  tests: string;
}

function workspacePackages(): WorkspacePackage[] {
  const packagesDir = join(repoRoot, 'packages');
  return readdirSync(packagesDir)
    .filter((entry) => isFile(join(packagesDir, entry, 'package.json')))
    .map((entry) => {
      const manifest = JSON.parse(
        readFileSync(join(packagesDir, entry, 'package.json'), 'utf8') as string,
      ) as { name?: string };
      return {
        name: manifest.name ?? '',
        src: join(packagesDir, entry, 'src'),
        tests: join(packagesDir, entry, 'tests'),
      };
    })
    .filter((pkg) => pkg.name.startsWith('@wrongstack/') && isDir(pkg.src));
}

/** Files reachable from `roots` through relative imports. */
function relativeClosure(roots: string[]): Set<string> {
  const reached = new Set<string>();
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiers(file)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelative(file, specifier);
      if (!target) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return reached;
}

interface RootConfig {
  resolve?: { alias?: Record<string, string> };
  test?: { coverage?: { include?: string[]; exclude?: string[] } };
}

async function loadRootConfig(): Promise<RootConfig> {
  const configUrl = pathToFileURL(resolve(repoRoot, 'vitest.config.ts')).href;
  const module = (await import(configUrl)) as { default?: RootConfig };
  return module.default ?? {};
}

describe('vitest source aliases cover the zero-statement coverage ratchet', () => {
  it('leaves no coverage-scoped file reachable only through an unaliased package specifier', async () => {
    const config = await loadRootConfig();
    const coverage = config.test?.coverage ?? {};
    const include = (coverage.include ?? []).map(globToRegExp);
    const exclude = (coverage.exclude ?? []).map(globToRegExp);
    const aliasKeys = Object.keys(config.resolve?.alias ?? {});

    const repoRelative = (file: string): string => relative(repoRoot, file).replaceAll('\\', '/');
    const inCoverageScope = (file: string): boolean => {
      const rel = repoRelative(file);
      if (!include.some((pattern) => pattern.test(rel))) return false;
      return !exclude.some((pattern) => pattern.test(rel));
    };
    const isSourceAliased = (name: string): boolean =>
      aliasKeys.some((key) => key === name || key.startsWith(`${name}/`));

    const packages = workspacePackages();
    const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));

    // Which package specifiers exist, and which entry point each resolves to.
    const specifierEntries = new Map<string, Set<string>>();
    for (const importer of packages) {
      for (const file of walk(importer.src)) {
        for (const specifier of importSpecifiers(file)) {
          const match = /^@wrongstack\/([a-z0-9-]+)(?:\/(.+))?$/.exec(specifier);
          if (!match) continue;
          const target = byName.get(`@wrongstack/${match[1] as string}`);
          if (!target) continue;
          const subpath = match[2];
          const entry = subpath
            ? join(target.src, subpath.replace(/\.js$/, '.ts'))
            : join(target.src, 'index.ts');
          const entries = specifierEntries.get(target.name) ?? new Set<string>();
          if (isFile(entry)) entries.add(entry);
          specifierEntries.set(target.name, entries);
        }
      }
    }

    // Every file the repository's tests load from source.
    const testRoots = [
      ...packages.flatMap((pkg) => [...walk(pkg.tests), ...walk(join(pkg.src, '__tests__'))]),
      ...walk(join(repoRoot, 'apps')),
    ].filter((file) => file.endsWith('.test.ts') || file.endsWith('.test.tsx'));
    const loadedFromSource = relativeClosure(testRoots);

    const violations: { file: string; package: string }[] = [];
    for (const [targetName, entries] of specifierEntries) {
      if (isSourceAliased(targetName)) continue;
      const target = byName.get(targetName);
      if (!target) continue;
      for (const file of relativeClosure([...entries])) {
        if (!file.startsWith(target.src)) continue;
        if (!inCoverageScope(file)) continue;
        if (loadedFromSource.has(file)) continue;
        if (!hasRuntimeStatements(file)) continue;
        violations.push({ file: repoRelative(file), package: targetName });
      }
    }

    const unique = [
      ...new Map(violations.map((violation) => [violation.file, violation])).values(),
    ].sort((left, right) => left.file.localeCompare(right.file));

    expect(
      unique,
      [
        'These files are only reachable through a package specifier that resolves to the',
        'built output, so the root suite never instruments them and the zero-statement',
        'coverage ratchet reports them as uncovered.',
        'Fix: give the package a source alias in scripts/vitest-core-aliases.mjs, the same',
        'way the other extracted packages are aliased.',
      ].join('\n'),
    ).toEqual([]);
  });
});
