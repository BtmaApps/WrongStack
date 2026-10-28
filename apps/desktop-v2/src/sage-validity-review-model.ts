import { entries, record } from './engine-values';

export interface SageSourceReview {
  checkedAt: string;
  observedRevision: number;
  checks: Array<{
    path: string;
    text: string;
    status: 'satisfied' | 'not_satisfied' | 'unknown';
    sourceHash?: string;
  }>;
}
export function readSageSourceReview(
  payload: Record<string, unknown>,
  memory: Record<string, unknown>,
): SageSourceReview {
  if (!payload['validityReview'])
    throw Error('This runtime cannot review applicability sources. Update the project runtime.');
  const review = record(payload['validityReview']),
    returned = record(payload['memory']);
  const expected = entries(record(memory['validity'])['checks']);
  const checks = entries(review['checks']);
  if (
    returned['id'] !== memory['id'] ||
    returned['revision'] !== memory['revision'] ||
    review['observedRevision'] !== memory['revision'] ||
    review['applicability'] !== 'unknown' ||
    typeof review['checkedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(review['checkedAt'])) ||
    !Array.isArray(review['checks']) ||
    checks.length !== review['checks'].length ||
    !Number.isSafeInteger(memory['revision']) ||
    checks.length !== expected.length ||
    checks.length > 4 ||
    checks.some((check, index) => {
      const original = expected[index];
      return (
        !original ||
        check['path'] !== String(original['path']).replaceAll('\\', '/') ||
        check['text'] !== original['text'] ||
        !['satisfied', 'not_satisfied', 'unknown'].includes(String(check['status'])) ||
        (check['sourceHash'] !== undefined &&
          (typeof check['sourceHash'] !== 'string' ||
            !/^sha256:[a-f0-9]{64}$/.test(check['sourceHash'])))
      );
    })
  )
    throw Error(
      'Source evidence does not match this memory revision and its checks. Refresh the record and retry.',
    );
  return {
    checkedAt: review['checkedAt'] as string,
    observedRevision: Number(review['observedRevision']),
    checks: checks as unknown as SageSourceReview['checks'],
  };
}
