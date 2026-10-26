/** Compare against the editor's original snapshot, so unrelated live worker changes survive. */
export function taskDefinitionPatch(
  baseline: Record<string, unknown>,
  draft: Record<string, unknown>,
) {
  const original = {
    title: String(baseline['title'] ?? ''),
    description: String(baseline['description'] ?? ''),
    priority: baseline['priority'] ?? 'medium',
    type: baseline['type'] ?? 'chore',
    status: baseline['status'] ?? 'pending',
    labels: baseline['labels'] ?? [],
    dueDate: typeof baseline['dueDate'] === 'string' ? baseline['dueDate'].slice(0, 10) : null,
    dependsOn: baseline['dependsOn'] ?? [],
    estimatedHours: baseline['estimatedHours'] ?? 0,
    actualHours: baseline['actualHours'] ?? 0,
    retryPolicy: baseline['retryPolicy'] ?? 'off',
    costCeilingUsd: baseline['costCeilingUsd'] ?? null,
  } as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        key === 'activityNote' || JSON.stringify(original[key]) !== JSON.stringify(value),
    ),
  );
}
