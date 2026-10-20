import path from 'node:path';
import type { ExploreProbe, ExploreProbeSource } from './explore-probe-types.js';

/** Lexical identity only; tool execution remains responsible for containment. */
export function exploreFileKey(file: string, projectRoot?: string): string {
  const normalized = path.normalize(file.replaceAll('\\', '/'));
  const key = projectRoot
    ? path.relative(projectRoot, path.resolve(projectRoot, normalized))
    : normalized;
  return (process.platform === 'win32' ? key.toLowerCase() : key).replaceAll('\\', '/');
}

/**
 * Path segments whose files are never worth a probe: scratch proofs, build
 * output, vendored dependencies, VCS internals. Measured on this repository,
 * 42% of all automatic probes (116 of 277 over three days) mapped the
 * "blast radius" of a `.temp_files/` proof script the leader had just written.
 */
const EXPLORE_IGNORED_SEGMENTS = new Set([
  '.temp_files',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.turbo',
  '.next',
]);

/** True when the path is outside the project or under a scratch/generated tree. */
export function exploreIgnoredPath(file: string, projectRoot?: string): boolean {
  const key = exploreFileKey(file, projectRoot);
  if (key === '' || key === '..' || key.startsWith('../') || path.isAbsolute(key)) {
    return projectRoot !== undefined;
  }
  return key.split('/').some((segment) => EXPLORE_IGNORED_SEGMENTS.has(segment));
}

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|swift|c|cc|cpp|h|hpp)$/i;
const TEST_FILE = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.[^/]+$/i;

/**
 * Production source the leader just opened. A first read of a test, doc,
 * config or fixture already shows the leader everything a probe would add;
 * only source modules have callers and dependents worth mapping.
 */
export function exploreIsSourceFile(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  return SOURCE_EXTENSION.test(normalized) && !TEST_FILE.test(normalized);
}

export function extractedExplorePath(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  for (const field of ['path', 'file', 'file_path']) {
    const value = rec[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

/** Recognize the actual tool JSON contracts before legacy text renderings. */
export function exploreSearchIsEmpty(e: {
  output?: string | undefined;
  outputLines?: number | undefined;
}): boolean {
  const out = e.output?.trim() ?? '';
  if (out.startsWith('{')) {
    try {
      const result = JSON.parse(out) as Record<string, unknown>;
      if (Array.isArray(result.matches)) return result.matches.length === 0 && result.count === 0;
      if (Array.isArray(result.results)) return result.results.length === 0 && result.total === 0;
    } catch {
      // Event previews can be truncated. Do not guess from a fragment of JSON.
      return false;
    }
  }
  return (
    e.outputLines === 0 ||
    /(?:^|\n)(?:no |0 )(?:matches|results|files? found|occurrences)/i.test(out) ||
    /^total\s*:\s*0\b/im.test(out)
  );
}

const PRIORITY: Record<ExploreProbeSource, number> = {
  mailbox_ask: 5,
  edit_unread_file: 4,
  error_symbol: 3,
  search_zero_hits: 2,
  todo_in_progress: 1,
  unfamiliar_read: 0,
};

export function exploreProbePriority(probe: ExploreProbe): number {
  return PRIORITY[probe.source];
}

/** Preserve zero where meaningful; reject NaN/Infinity and timer spin loops. */
export function exploreNumber(value: number | undefined, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

export function exploreSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

const ERROR_BOILERPLATE = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'Cannot',
  'Could',
  'Failed',
  'Unhandled',
  'Timeout',
  'ENOENT',
  'EACCES',
  'EPERM',
  'ECONNREFUSED',
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
]);

/** Preserve path-qualified hints; don't spend the two error slots on "Cannot". */
export function extractExploreSubjects(
  text: string,
): Array<{ kind: 'file' | 'symbol'; value: string }> {
  const out: Array<{ kind: 'file' | 'symbol'; value: string }> = [];
  const seen = new Set<string>();
  const fileRe = /((?:[A-Za-z]:)?[\w@./\\-]+\.(?:[cm]?[jt]sx?|json|md|py|go|rs|ya?ml))\b/g;
  for (const m of text.matchAll(fileRe)) {
    const value = m[1];
    if (value && !seen.has(`file:${value}`)) {
      seen.add(`file:${value}`);
      out.push({ kind: 'file', value });
    }
  }
  for (const m of text.matchAll(/\b[A-Z][A-Za-z0-9_]{2,}\b/g)) {
    const value = m[0];
    if (!ERROR_BOILERPLATE.has(value) && !seen.has(`symbol:${value}`)) {
      seen.add(`symbol:${value}`);
      out.push({ kind: 'symbol', value });
    }
  }
  return out;
}
