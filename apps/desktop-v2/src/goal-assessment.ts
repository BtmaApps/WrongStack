/** Assessments are project-wide replies: only the current draft's request is usable. */
export function matchingGoalAssessment(
  result: Record<string, unknown> | undefined,
  requestSequence: number,
): Record<string, unknown> | null {
  return requestSequence !== 0 && result?.['reqSeq'] === requestSequence ? result : null;
}
