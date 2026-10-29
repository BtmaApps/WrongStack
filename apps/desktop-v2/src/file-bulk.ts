/** Selected paths without those already covered by a selected ancestor folder. */
export function topLevelPaths(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].toSorted();
  return unique.filter(
    (path) => !unique.some((other) => other !== path && path.startsWith(`${other}/`)),
  );
}

/** Project-relative destination folder; empty, `.` and `./` mean the project root. */
export function bulkDestination(value: string): string {
  const folder = value
    .trim()
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  return folder === '' || folder === '.' ? '.' : folder;
}

/** The new location of `path` after `from` moved to `to`, or null when it is unaffected. */
export function relocatedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : null;
}

export interface BulkOutcome {
  done: string[];
  failed: { path: string; error: string }[];
}

/**
 * Runs one operation per path in order. A failure is recorded and the rest still run, so the
 * report says exactly which items changed; nothing is retried.
 */
export async function runBulk(
  paths: readonly string[],
  operation: (path: string) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<BulkOutcome & { skipped: string[] }> {
  const outcome = {
    done: [] as string[],
    failed: [] as BulkOutcome['failed'],
    skipped: [] as string[],
  };
  for (const [index, path] of paths.entries()) {
    if (shouldStop()) {
      outcome.skipped.push(...paths.slice(index));
      break;
    }
    try {
      await operation(path);
      outcome.done.push(path);
    } catch (error) {
      outcome.failed.push({ path, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcome;
}

export function bulkSummary(
  verb: 'Moved' | 'Deleted',
  total: number,
  outcome: BulkOutcome & { skipped: string[] },
): string {
  const parts = [`${verb} ${outcome.done.length} of ${total} items.`];
  if (outcome.failed.length)
    parts.push(
      `Failed: ${outcome.failed.map((item) => `${item.path} (${item.error})`).join('; ')}.`,
    );
  if (outcome.skipped.length) parts.push(`Not attempted: ${outcome.skipped.join(', ')}.`);
  return parts.join(' ');
}
