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
