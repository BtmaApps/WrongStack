import { median } from './aggregate.js';
import type { BenchReport, TaskResult } from './types.js';

export interface RoutingPolicy {
  version: 1;
  categories: Record<string, string[]>;
  minAttempts?: number;
  minPassRate?: number;
  objective?: 'cost' | 'latency';
}
function usable(result: TaskResult): boolean {
  return (
    result.grade.graded !== false &&
    typeof result.grade.passed === 'boolean' &&
    ['completed', 'failed', 'aborted', 'max_iterations'].includes(result.run.status)
  );
}
/** Read-only routing recommendations from the existing model matrix; never changes live routing. */
export function routingExperiment(report: BenchReport, policy: RoutingPolicy) {
  const minAttempts = policy.minAttempts ?? 3;
  const minPassRate = policy.minPassRate ?? 0.8;
  if (
    policy.version !== 1 ||
    !policy.categories ||
    typeof policy.categories !== 'object' ||
    Array.isArray(policy.categories) ||
    !Number.isSafeInteger(minAttempts) ||
    minAttempts < 1 ||
    minAttempts > 10000 ||
    !Number.isFinite(minPassRate) ||
    minPassRate < 0 ||
    minPassRate > 1 ||
    (policy.objective !== undefined && !['cost', 'latency'].includes(policy.objective))
  )
    throw new Error('Invalid routing experiment policy');
  const entries = Object.entries(policy.categories);
  if (entries.length > 100) throw new Error('Too many routing categories');
  return {
    version: 1,
    mode: 'shadow',
    fingerprint: report.fingerprint.hash,
    categories: entries.map(([category, taskIds]) => {
      if (
        !category ||
        category.length > 128 ||
        !Array.isArray(taskIds) ||
        !taskIds.length ||
        taskIds.length > 10000 ||
        taskIds.some((id) => typeof id !== 'string' || !id)
      )
        throw new Error('Invalid category tasks');
      const ids = new Set(taskIds);
      const grouped = new Map<string, TaskResult[]>();
      const expectedAttempts = new Set(
        report.results
          .filter((row) => ids.has(row.taskId))
          .map((row) => JSON.stringify([row.taskId, row.attempt ?? 1])),
      );
      for (const row of report.results)
        if (ids.has(row.taskId)) {
          const key = JSON.stringify([row.cell.provider, row.cell.model]);
          const rows = grouped.get(key) ?? [];
          rows.push(row);
          grouped.set(key, rows);
        }
      const candidates = [...grouped.values()].map((rows) => {
        const graded = rows.filter(usable);
        const passRate = graded.length
          ? graded.filter((row) => row.grade.passed).length / graded.length
          : null;
        const attempts = new Set(rows.map((row) => JSON.stringify([row.taskId, row.attempt ?? 1])));
        const completeCorpus =
          [...ids].every((id) => rows.some((row) => row.taskId === id)) &&
          attempts.size === rows.length &&
          attempts.size === expectedAttempts.size;
        const priced = rows.every(
          (row) =>
            row.run.costSource === 'catalog-estimate' &&
            Number.isFinite(row.run.costUsd) &&
            row.run.costUsd >= 0,
        );
        const costUsd = priced
          ? rows.reduce((sum, row) => sum + row.run.costUsd, 0) / rows.length
          : null;
        const latencyKnown = rows.every(
          (row) => Number.isFinite(row.run.elapsedMs) && row.run.elapsedMs >= 0,
        );
        const elapsedMs = latencyKnown ? median(rows.map((row) => row.run.elapsedMs)) : null;
        const reasons = [
          !completeCorpus ? 'incomplete-category-corpus' : '',
          graded.length < minAttempts ? 'insufficient-attempts' : '',
          graded.length !== rows.length ? 'ungraded-or-incomplete-attempts' : '',
          passRate === null || passRate < minPassRate ? 'below-quality-threshold' : '',
          (policy.objective ?? 'cost') === 'cost' && costUsd === null ? 'unknown-cost' : '',
          policy.objective === 'latency' && elapsedMs === null ? 'unknown-latency' : '',
        ].filter(Boolean);
        return {
          cell: rows[0]!.cell,
          attempts: rows.length,
          passRate,
          costUsd,
          elapsedMs,
          eligible: !reasons.length,
          reasons,
        };
      });
      const eligible = candidates
        .filter((candidate) => candidate.eligible)
        .sort(
          (a, b) =>
            (policy.objective === 'latency'
              ? a.elapsedMs! - b.elapsedMs!
              : a.costUsd! - b.costUsd!) || a.cell.label.localeCompare(b.cell.label),
        );
      return {
        category,
        taskIds,
        recommended: eligible[0]?.cell ?? null,
        reason: eligible.length
          ? `quality threshold met; lowest measured ${policy.objective ?? 'cost'}`
          : 'No candidate meets the evidence requirements.',
        candidates,
      };
    }),
  };
}

/** Paired continuation metrics on exactly the same task/model/attempt corpus. */
export function compareQualityExperiment(
  baseline: BenchReport,
  candidate: BenchReport,
  dimension: 'compaction' | 'behavior',
) {
  if (!['compaction', 'behavior'].includes(dimension))
    throw new Error('Choose compaction or behavior');
  const fixed = [
    'cliVersion',
    'toolNames',
    'maxIterations',
    'yolo',
    'subsetId',
    'toolManifestHash',
    'systemPromptHash',
  ] as const;
  if (
    baseline.suite !== candidate.suite ||
    fixed.some(
      (key) =>
        JSON.stringify(baseline.fingerprint[key]) !== JSON.stringify(candidate.fingerprint[key]),
    )
  )
    throw new Error('Experiment changed fixed harness fields');
  const key = (row: TaskResult) =>
    JSON.stringify([row.taskId, row.cell.provider, row.cell.model, row.attempt ?? 1]);
  const index = (report: BenchReport) => {
    const rows = new Map<string, TaskResult>();
    for (const row of report.results) {
      const id = key(row);
      if (rows.has(id)) throw new Error('Duplicate experiment attempt');
      rows.set(id, row);
    }
    return rows;
  };
  const left = index(baseline);
  const right = index(candidate);
  if (!left.size || left.size !== right.size || [...left.keys()].some((id) => !right.has(id)))
    throw new Error('Experiment requires identical task/model/attempt corpus');
  const metrics = (report: BenchReport) => {
    const reviews = report.results.flatMap((row) => (row.qualityReview ? [row.qualityReview] : []));
    return {
      attempts: report.results.length,
      graded: report.results.filter(usable).length,
      passed: report.results.filter((row) => usable(row) && row.grade.passed).length,
      traceCases: report.results.filter((row) => row.traceEval).length,
      retrievalPassed: report.results.filter((row) => row.traceEval?.retrievalPassed).length,
      recallPassed: report.results.filter((row) => row.traceEval?.recallPassed).length,
      editApplicationPassed: report.results.filter((row) => row.traceEval?.editApplicationPassed)
        .length,
      medianElapsedMs: report.results.every(
        (row) => Number.isFinite(row.run.elapsedMs) && row.run.elapsedMs >= 0,
      )
        ? median(report.results.map((row) => row.run.elapsedMs))
        : null,
      costUsd: report.results.every(
        (row) =>
          usable(row) &&
          row.run.costSource === 'catalog-estimate' &&
          Number.isFinite(row.run.costUsd) &&
          row.run.costUsd >= 0,
      )
        ? report.results.reduce((sum, row) => sum + row.run.costUsd, 0)
        : null,
      reviewAttempts: reviews.length,
      advisoryFindings: reviews.reduce((sum, review) => sum + review.findings.length, 0),
      rereadsAfterCompaction:
        reviews.length === report.results.length
          ? reviews.reduce((sum, review) => sum + review.observations.rereadsAfterCompaction, 0)
          : null,
      fullRequestTokensSaved:
        reviews.length === report.results.length &&
        reviews.every((review) => review.observations.fullRequestTokensSaved !== null)
          ? reviews.reduce((sum, review) => sum + review.observations.fullRequestTokensSaved!, 0)
          : null,
    };
  };
  return {
    version: 1,
    dimension,
    configurationEvidence: 'operator-declared' as const,
    note: 'Paired corpus verified. Config hashes alone cannot prove that only the declared setting changed. Deterministic grades remain the completion evidence.',
    baseline: { fingerprint: baseline.fingerprint.hash, metrics: metrics(baseline) },
    candidate: { fingerprint: candidate.fingerprint.hash, metrics: metrics(candidate) },
  };
}
