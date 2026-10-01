import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BenchReport, TaskResult } from '../types.js';

/**
 * Write the machine-readable report artifacts:
 *   - results.jsonl  → one line per (task × cell), for reproducibility
 *   - summary.json   → fingerprint + folded cell results
 *
 * The markdown report is derived from summary.json (see report/markdown.ts), so
 * `wstack bench report` can re-render without re-running anything.
 */
export async function writeJsonArtifacts(outDir: string, report: BenchReport): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });

  const jsonl = report.results.map((r) => JSON.stringify(r)).join('\n');
  await fs.writeFile(path.join(outDir, 'results.jsonl'), jsonl + (jsonl ? '\n' : ''), 'utf8');

  const summary = {
    suite: report.suite,
    finishedAt: report.finishedAt,
    fingerprint: report.fingerprint,
    cells: report.cells,
  };
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
}

/** Read back a summary.json into the partial report shape markdown needs. */
export async function readSummary(
  outDir: string,
): Promise<Pick<BenchReport, 'suite' | 'finishedAt' | 'fingerprint' | 'cells'>> {
  const raw = await fs.readFile(path.join(outDir, 'summary.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    typeof parsed['suite'] !== 'string' ||
    typeof parsed['finishedAt'] !== 'string' ||
    !isRecord(parsed['fingerprint']) ||
    !Array.isArray(parsed['cells']) ||
    !parsed['cells'].every(isCellResultRecord)
  ) {
    throw new Error('Benchmark summary has an invalid envelope.');
  }
  return parsed as unknown as Pick<BenchReport, 'suite' | 'finishedAt' | 'fingerprint' | 'cells'>;
}

/** Load per-(task × cell) rows from a finished run directory. Missing file → []. */
export async function readResultsJsonl(outDir: string): Promise<TaskResult[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(outDir, 'results.jsonl'), 'utf8');
  } catch {
    return [];
  }
  const rows: TaskResult[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isTaskResultRecord(parsed)) rows.push(parsed as unknown as TaskResult);
    } catch {
      // `bench run` streams partial results.jsonl to disk during the run so a
      // crash keeps partial results; a hard-killed write can leave a truncated
      // trailing line. Tolerate it (like readSessionLogEvents) instead of
      // throwing and losing the whole report read.
    }
  }
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCellResultRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value['cell']) &&
    typeof value['cell']['label'] === 'string' &&
    value['cell']['label'].length > 0
  );
}

function isTaskResultRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['taskId'] === 'string' &&
    value['taskId'].length > 0 &&
    isCellResultRecord({ cell: value['cell'] }) &&
    isRecord(value['grade']) &&
    isRecord(value['run']) &&
    isRecord(value['tools'])
  );
}

/** Load summary.json plus results.jsonl so a report can be re-rendered or compared. */
export async function readRunDir(outDir: string): Promise<BenchReport> {
  const summary = await readSummary(outDir);
  const results = await readResultsJsonl(outDir);
  return { ...summary, results };
}
