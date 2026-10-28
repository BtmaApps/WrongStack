import { entries, record } from './engine-values';

export function techLabel(value: unknown): string {
  return typeof value === 'string' && value ? value.replaceAll('_', ' ') : 'Not reported';
}
export function techVersion(dependency: Record<string, unknown>): string {
  return String(
    dependency['locked'] ?? dependency['installed'] ?? dependency['requested'] ?? 'Not reported',
  );
}
export function techInterpretation(finding: Record<string, unknown>): boolean {
  return (
    entries(finding['evidence']).some((item) => item['kind'] === 'agent') ||
    (typeof finding['confidence'] === 'number' && finding['confidence'] < 1)
  );
}
export function techPlanKey(item: Record<string, unknown>): string {
  return `${item['workspaceId']}:${item['ecosystem']}:${item['dependencyName']}:${item['action']}`;
}
export function techPlanSelectionIsCurrent(
  reviewed: Record<string, unknown>,
  latest: Record<string, unknown>,
  selected: string[],
): boolean {
  if (!selected.length || reviewed['snapshotId'] !== latest['snapshotId']) return false;
  const before = entries(reviewed['items']),
    after = entries(latest['items']);
  return selected.every((key) => {
    const a = before.find((item) => techPlanKey(item) === key),
      b = after.find((item) => techPlanKey(item) === key);
    return (
      a &&
      b &&
      ['currentVersion', 'targetVersion', 'rationale', 'breakingRisk', 'severity'].every(
        (field) => a[field] === b[field],
      )
    );
  });
}
export function techFilteredDependencies(
  snapshot: Record<string, unknown>,
  query: string,
  workspace: string,
  status: string,
  scope: string,
): Record<string, unknown>[] {
  return entries(snapshot['dependencies']).filter(
    (item) =>
      (!workspace || item['workspaceId'] === workspace) &&
      (!status || item['status'] === status) &&
      (!scope || (scope === 'direct' ? item['direct'] === true : item['direct'] !== true)) &&
      `${item['name']} ${item['ecosystem']} ${item['requested']} ${techVersion(item)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
}
export function techSummary(snapshot: Record<string, unknown>) {
  const dependencies = entries(snapshot['dependencies']);
  return {
    total: dependencies.length,
    direct: dependencies.filter((item) => item['direct'] === true).length,
    vulnerable: dependencies.filter((item) => item['status'] === 'vulnerable').length,
    upgrades: dependencies.filter((item) => String(item['status']).startsWith('update_available'))
      .length,
    workspaces: entries(snapshot['workspaces']).length,
    findings: entries(snapshot['findings']).length,
  };
}
export function techRunning(job: unknown): boolean {
  return [
    'queued',
    'discovering',
    'inventorying',
    'enriching',
    'researching',
    'synthesizing',
  ].includes(String(record(job)['status']));
}
