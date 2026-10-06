/**
 * The dead-code engine's file universe: executable source files only.
 *
 * Declarations (`.d.ts`), documentation, fixtures, build output and vendored
 * code are never candidates and never keep anything alive — a code sample in a
 * README importing `foo` must not make `foo` look used, and a `.d.ts` has no
 * code to delete. Non-code text (package.json, CI workflows, HTML) is read
 * separately, only to discover entry points.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildChildEnv, compilePathGlob } from '@wrongstack/core/utils';
import { loadGitignoreMatcher } from '../codebase-index/gitignore.js';

export const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const DECLARATION_FILE = /\.d\.[cm]?ts$/i;
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/i;

/** Never analysed: build output, dependencies, declarations, fixtures, docs, scratch. */
export const DEFAULT_IGNORE_GLOBS: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-*/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/fixtures/**',
  '**/__fixtures__/**',
  '**/__snapshots__/**',
  '**/__mocks__/**',
  'docs/**',
  '**/docs/**',
  'examples/**',
  '.temp_files/**',
  '.wrongstack/**',
  '.claude/**',
];

/** Test files are roots of the test graph; never dead-code candidates themselves. */
const TEST_FILE = /(?:^|[/.])(?:test|spec|bench|e2e)(?:-d)?\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//i;
/** Helpers living next to tests: candidates only for whole-file death. */
const TEST_SUPPORT_DIR = /(?:^|\/)(?:tests?|e2e|__tests__|test-utils|testing)\//i;
/** Loaded by a tool by convention, not imported. */
const TOOL_CONFIG_FILE =
  /(?:^|\/)(?:vitest|jest|test|tests|playwright|global)[.-]setup\.[cm]?[jt]sx?$|(?:^|\/)vitest\.workspace\.[cm]?[jt]s$|(?:^|\/)\.[\w-]+rc\.[cm]?[jt]s$|\.stories\.[cm]?[jt]sx?$|(?:^|\/)\.storybook\//i;
/** `<tool>.config.ts` — outside `src/`, where a `foo.config.ts` is ordinary source. */
const CONFIG_FILE = /(?:^|\/)[\w.-]+\.config\.[cm]?[jt]s$/i;
const UNDER_SRC = /(?:^|\/)src\//;

export type FileRole = 'source' | 'test' | 'test-support' | 'tool';

export function classifyFile(rel: string): FileRole {
  if (TEST_FILE.test(rel)) return 'test';
  if (TOOL_CONFIG_FILE.test(rel)) return 'tool';
  if (CONFIG_FILE.test(rel) && !UNDER_SRC.test(rel)) return 'tool';
  if (TEST_SUPPORT_DIR.test(rel)) return 'test-support';
  return 'source';
}

export function isCodeFile(rel: string): boolean {
  return CODE_FILE.test(rel) && !DECLARATION_FILE.test(rel);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/').replace(/\\/g, '/');
}

export interface ProjectFiles {
  /** Every non-ignored file, project-relative posix (code and non-code). */
  all: string[];
  /** Executable code files. */
  code: string[];
}

export function compileIgnore(globs: readonly string[]): (rel: string) => boolean {
  const res = globs.map((g) => compilePathGlob(g));
  return (rel) => res.some((re) => re.test(rel));
}

function gitListFiles(projectRoot: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
      cwd: projectRoot,
      env: buildChildEnv(),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

async function walkFiles(projectRoot: string): Promise<string[]> {
  const ignored = await loadGitignoreMatcher(projectRoot);
  const out: string[] = [];
  const stack = [''];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(projectRoot, relDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!ignored(rel, true)) stack.push(rel);
      } else if (e.isFile() && !ignored(rel, false)) {
        out.push(rel);
      }
    }
  }
  return out;
}

export async function listProjectFiles(
  projectRoot: string,
  extraIgnore: readonly string[] = [],
): Promise<ProjectFiles> {
  const listed = gitListFiles(projectRoot) ?? (await walkFiles(projectRoot));
  const isIgnored = compileIgnore([...DEFAULT_IGNORE_GLOBS, ...extraIgnore]);
  const all: string[] = [];
  const code: string[] = [];
  for (const raw of listed) {
    const rel = toPosix(raw);
    if (isIgnored(rel)) continue;
    // `git ls-files -c` still lists files deleted from the work tree.
    if (!fs.existsSync(path.join(projectRoot, rel))) continue;
    all.push(rel);
    if (isCodeFile(rel)) code.push(rel);
  }
  all.sort();
  code.sort();
  return { all, code };
}

// ─── Workspace packages ─────────────────────────────────────────────────

export interface PackageInfo {
  name: string;
  /** Project-relative posix dir ('' = project root). */
  dir: string;
  private: boolean;
  manifest: Record<string, unknown>;
}

export function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function discoverPackages(projectRoot: string, allFiles: readonly string[]): PackageInfo[] {
  const out: PackageInfo[] = [];
  for (const rel of allFiles) {
    if (rel !== 'package.json' && !rel.endsWith('/package.json')) continue;
    const manifest = readJson(path.join(projectRoot, rel));
    if (!manifest) continue;
    const dir = rel === 'package.json' ? '' : rel.slice(0, -'/package.json'.length);
    out.push({
      name: typeof manifest.name === 'string' ? manifest.name : dir || '(root)',
      dir,
      private: manifest.private === true,
      manifest,
    });
  }
  // Deepest first, so ownership lookups find the innermost package.
  out.sort((a, b) => b.dir.length - a.dir.length);
  return out;
}

export function owningPackage(
  packages: readonly PackageInfo[],
  rel: string,
): PackageInfo | undefined {
  for (const pkg of packages) {
    if (pkg.dir === '' || rel === pkg.dir || rel.startsWith(`${pkg.dir}/`)) return pkg;
  }
  return undefined;
}
