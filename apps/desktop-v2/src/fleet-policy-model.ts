/** Validate only edited fleet fields; preserve the rest of the profile. */
export function fleetPolicyIssue(patch: Record<string, unknown>): string {
  if (
    Object.hasOwn(patch, 'maxConcurrent') &&
    (!Number.isSafeInteger(patch['maxConcurrent']) || Number(patch['maxConcurrent']) < 1)
  )
    return 'Concurrent agents must be a positive whole number.';
  if (
    Object.hasOwn(patch, 'fleetChatVerbosity') &&
    !['off', 'full'].includes(String(patch['fleetChatVerbosity']))
  )
    return 'Choose quiet or detailed fleet chat.';
  for (const key of [
    'nextPrediction',
    'nextStepsTool',
    'memoryCompanionEnabled',
    'exploreCompanionEnabled',
    'skillCompanionEnabled',
  ])
    if (Object.hasOwn(patch, key) && typeof patch[key] !== 'boolean')
      return 'Fleet and companion switches need an explicit enabled or disabled value.';
  return '';
}
