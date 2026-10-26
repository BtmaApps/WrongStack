export interface FileDiffEntry {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  linesAdded: number;
  linesRemoved: number;
}

export interface TestResult {
  testPattern: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  /** Truncated failure output when tests fail. */
  failureOutput?: string | undefined;
}

const operationOf = (status: string): FileDiffEntry['operation'] =>
  status.startsWith('A') ? 'create' : status.startsWith('D') ? 'delete' : 'modify';

/**
 * Parse `git diff --name-status` into file-operation evidence. Accepts the
 * `-z` form too, whose paths are raw — the line form C-quotes any path with a
 * non-ASCII byte (`src/ğ.ts` → `"src/\304\237.ts"`) under git's default
 * `core.quotePath`, which no longer names the file.
 */
export function parseGitNameStatus(output: string): Map<string, FileDiffEntry['operation']> {
  const operations = new Map<string, FileDiffEntry['operation']>();
  if (output.includes('\0')) {
    const fields = output.split('\0');
    for (let index = 0; index < fields.length; ) {
      const status = fields[index] ?? '';
      if (!status) {
        index += 1;
        continue;
      }
      // Renames/copies carry two paths (old, new); the new one is the change.
      const pathCount = /^[RC]/.test(status) ? 2 : 1;
      const filePath = fields[index + pathCount];
      if (filePath) operations.set(filePath, operationOf(status));
      index += pathCount + 1;
    }
    return operations;
  }
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [status = '', ...pathParts] = line.split('\t');
    const filePath = /^[RC]/.test(status) ? pathParts.at(-1) : pathParts.join('\t');
    if (!filePath) continue;
    operations.set(filePath, operationOf(status));
  }
  return operations;
}

/** Parse `git diff --numstat` output (line or `-z` form) into structured entries. */
export function parseGitNumstat(
  output: string,
  operations: ReadonlyMap<string, FileDiffEntry['operation']> = new Map(),
): FileDiffEntry[] {
  if (output.includes('\0')) {
    const entries: FileDiffEntry[] = [];
    const fields = output.split('\0');
    for (let index = 0; index < fields.length; index += 1) {
      const parts = (fields[index] ?? '').split('\t');
      if (parts.length < 3) continue;
      let filePath = parts.slice(2).join('\t');
      // A rename/copy record has an empty path, then old and new paths.
      if (!filePath) {
        filePath = fields[index + 2] ?? '';
        index += 2;
      }
      if (!filePath) continue;
      entries.push({
        path: filePath,
        operation: operations.get(filePath) ?? 'modify',
        linesAdded: parseInt(parts[0]!, 10) || 0,
        linesRemoved: parseInt(parts[1]!, 10) || 0,
      });
    }
    return entries;
  }
  return output
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 3) return null;
      const added = parseInt(parts[0]!, 10) || 0;
      const removed = parseInt(parts[1]!, 10) || 0;
      const filePath = parts.slice(2).join('\t');
      return {
        path: filePath,
        operation: operations.get(filePath) ?? 'modify',
        linesAdded: added,
        linesRemoved: removed,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

export function isTestCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isTestJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate['testResults']) ||
    (isTestCount(candidate['numPassedTests']) && isTestCount(candidate['numFailedTests']))
  );
}

export function parseTestJsonObject(output: string): Record<string, unknown> | null {
  try {
    const complete = JSON.parse(output.trim()) as unknown;
    if (isTestJsonObject(complete)) return complete;
  } catch {
    // Surrounding runner output requires balanced-object extraction below.
  }

  for (let start = output.indexOf('{'); start >= 0; start = output.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const char = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(output.slice(start, index + 1)) as unknown;
            if (isTestJsonObject(parsed)) return parsed;
          } catch {
            // Keep scanning: runner output can contain unrelated brace-delimited text.
          }
          break;
        }
      }
    }
  }
  return null;
}

function aggregateAssertionCounts(
  testResults: unknown,
): { passed: number; failed: number; skipped: number } | null {
  if (!Array.isArray(testResults)) return null;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let sawAssertions = false;
  for (const suite of testResults) {
    if (!suite || typeof suite !== 'object') continue;
    const assertions = (suite as Record<string, unknown>)['assertionResults'];
    if (!Array.isArray(assertions)) continue;
    for (const assertion of assertions) {
      if (!assertion || typeof assertion !== 'object') continue;
      const status = (assertion as Record<string, unknown>)['status'];
      if (typeof status !== 'string') continue;
      sawAssertions = true;
      if (status === 'passed') passed += 1;
      else if (status === 'failed') failed += 1;
      else if (status === 'pending' || status === 'skipped' || status === 'todo') skipped += 1;
    }
  }
  return sawAssertions ? { passed, failed, skipped } : null;
}

/** Try to parse JSON test runner output. */
export function tryParseTestJson(
  output: string,
  pattern: string,
): Omit<TestResult, 'durationMs'> | null {
  try {
    const parsed = parseTestJsonObject(output);
    if (parsed) {
      const numPassedTestsValue = parsed['numPassedTests'];
      const numFailedTestsValue = parsed['numFailedTests'];
      const numSkippedTestsValue = parsed['numSkippedTests'];
      const successValue = parsed['success'];
      const aggregated = aggregateAssertionCounts(parsed['testResults']);
      const numPassed = isTestCount(numPassedTestsValue)
        ? numPassedTestsValue
        : aggregated
          ? aggregated.passed
          : typeof successValue === 'boolean'
            ? successValue
              ? 1
              : 0
            : 0;
      const numFailed = isTestCount(numFailedTestsValue)
        ? numFailedTestsValue
        : aggregated
          ? aggregated.failed
          : typeof successValue === 'boolean'
            ? successValue
              ? 0
              : 1
            : 0;
      // vitest and jest report skipped tests as `numPendingTests` (+ `numTodoTests`)
      // and never emit `numSkippedTests`, so reading only that key recorded 0.
      const pending = parsed['numPendingTests'];
      const todo = parsed['numTodoTests'];
      const pendingPlusTodo = (isTestCount(pending) ? pending : 0) + (isTestCount(todo) ? todo : 0);
      const numSkipped = isTestCount(numSkippedTestsValue)
        ? numSkippedTestsValue
        : pendingPlusTodo > 0 || !aggregated
          ? pendingPlusTodo
          : aggregated.skipped;
      return {
        testPattern: pattern,
        passed: numPassed,
        failed: numFailed,
        skipped: numSkipped,
      };
    }
  } catch {
    // Not JSON output — fall through
  }
  return null;
}
