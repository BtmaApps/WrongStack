import type { SideEffect } from '@wrongstack/contracts/types';
import { record } from './engine-values';

export const effectKinds = ['shell', 'package', 'network', 'fs.write', 'config'] as const;
export const effectLabels: Record<string, string> = {
  shell: 'Shell',
  package: 'Packages',
  network: 'Network',
  'fs.write': 'File writes',
  config: 'Configuration',
};
export interface EffectsSnapshot {
  entries: SideEffect[];
  total: number | null;
  truncated: boolean;
}
export function effectsSnapshot(
  payload: Record<string, unknown>,
  sessionId: string,
): EffectsSnapshot {
  if (payload['sessionId'] !== sessionId || !Array.isArray(payload['sideEffects']))
    throw Error('Side-effect history belongs to another conversation or has no records.');
  const entries = payload['sideEffects'].map((value) => {
    const row = record(value);
    if (
      !['toolUseId', 'toolName', 'risk', 'ts'].every(
        (key) => typeof row[key] === 'string' && row[key],
      ) ||
      !Number.isFinite(Date.parse(String(row['ts']))) ||
      !row['input'] ||
      typeof row['input'] !== 'object' ||
      Array.isArray(row['input']) ||
      (row['outcome'] !== undefined && typeof row['outcome'] !== 'string')
    )
      throw Error('The engine returned an invalid side-effect record.');
    return {
      toolUseId: String(row['toolUseId']),
      toolName: String(row['toolName']),
      ts: String(row['ts']),
      risk: row['risk'] as SideEffect['risk'],
      input: record(row['input']),
      ...(typeof row['outcome'] === 'string' ? { outcome: row['outcome'] } : {}),
    };
  });
  const total = payload['total'];
  if (total !== undefined && (!Number.isSafeInteger(total) || Number(total) < entries.length))
    throw Error('The side-effect record count is inconsistent.');
  return {
    entries,
    total: typeof total === 'number' ? total : null,
    truncated:
      payload['truncated'] === true || (typeof total === 'number' && total > entries.length),
  };
}
export function effectSummary(effect: SideEffect): string {
  for (const key of ['command', 'url', 'filePath', 'path', 'packages']) {
    const value = effect.input[key];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ');
  }
  return Object.keys(effect.input).length
    ? `${Object.keys(effect.input).length} recorded input fields`
    : 'No input details recorded';
}
function csvCell(value: string): string {
  const safe = /^(?:[\t\r\n]|\s*[=+@-])/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function effectsCsv(entries: SideEffect[]): string {
  return [
    ['timestamp', 'tool', 'kind', 'detail', 'outcome', 'tool_call_id'],
    ...entries.map((entry) => [
      entry.ts,
      entry.toolName,
      entry.risk,
      effectSummary(entry),
      entry.outcome ?? '',
      entry.toolUseId,
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}
