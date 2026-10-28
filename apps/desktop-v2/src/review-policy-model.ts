import { record } from './engine-values';

const numericLimits: Record<string, [string, number, number]> = {
  chimeraMaxFiles: ['Chimera file limit', 1, Number.MAX_SAFE_INTEGER],
  autoReviewMaxFilesPerBatch: ['Automatic review batch size', 1, Number.MAX_SAFE_INTEGER],
  autoReviewMaxConcurrentReviews: ['Concurrent automatic reviews', 1, Number.MAX_SAFE_INTEGER],
  autoReviewDebounceMs: ['Automatic review delay', 0, 2_147_483_647],
};

export function reviewPolicyIssue(patch: Record<string, unknown>): string | null {
  for (const [key, [label, min, max]] of Object.entries(numericLimits)) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
      return `${label} must be a whole number between ${min} and ${max}.`;
  }
  return null;
}

export function reviewModelChange(prefix: 'chimera' | 'autoReview', reference: string) {
  const slash = reference.indexOf('/');
  return {
    [`${prefix}Provider`]: slash > 0 ? reference.slice(0, slash) : '',
    [`${prefix}Model`]: slash > 0 ? reference.slice(slash + 1) : reference,
    ...(prefix === 'autoReview' ? { autoReviewFallbackProfile: '' } : {}),
  };
}

export function reviewModelReference(draft: Record<string, unknown>, prefix: string) {
  const provider = String(draft[`${prefix}Provider`] ?? '');
  const model = String(draft[`${prefix}Model`] ?? '');
  return provider ? `${provider}/${model}` : model;
}

export function reviewChainPreview(saved: Record<string, unknown>, draft: Record<string, unknown>) {
  const keys = ['autoReviewFallbackProfile', 'fallbackModels', 'fallbackAuto', 'fallbackProfiles'];
  const stale = keys.some((key) => JSON.stringify(saved[key]) !== JSON.stringify(draft[key]));
  const chain = Array.isArray(saved['autoReviewFallbackModels'])
    ? saved['autoReviewFallbackModels'].map(String)
    : [];
  const profile = String(draft['autoReviewFallbackProfile'] ?? '');
  const missing = Boolean(profile && !Object.hasOwn(record(draft['fallbackProfiles']), profile));
  return { chain, stale, missing };
}
