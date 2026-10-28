import { entries, record } from './engine-values';
export const sageKinds = [
  'fact',
  'decision',
  'convention',
  'preference',
  'warning',
  'anti_pattern',
  'workflow',
  'bug_root_cause',
  'file_note',
  'symbol_note',
  'command_note',
  'summary',
  'memory_review',
  'tool_outcome',
  'error_pattern',
  'session_digest',
  'role_operational',
  'task_outcome',
  'security_signal',
  'fleet_convention',
] as const;
export const sageStatuses = [
  'active',
  'stale',
  'superseded',
  'contradicted',
  'archived',
  'deleted',
] as const;
export const sageRepairs = [
  {
    id: 'hygiene',
    title: 'Run memory hygiene',
    description: 'Verify anchors, review expiration, and prepare maintenance proposals.',
  },
  {
    id: 'graph-hubs',
    title: 'Clean graph hubs',
    description: 'Remove noisy topic links around hub nodes.',
  },
  {
    id: 'dangling-edges',
    title: 'Remove dangling links',
    description: 'Clean relationships whose memory endpoint no longer exists.',
  },
  {
    id: 'audience-runtime-mode',
    title: 'Repair audience defaults',
    description: 'Remove inherited default runtime-mode restrictions.',
  },
  {
    id: 'fts-rebuild',
    title: 'Rebuild text search',
    description: 'Rebuild the full-text index from existing SAGE records.',
  },
] as const;
export const words = (value: string) =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
export function sageEditor(memory: Record<string, unknown> | null) {
  const audience = record(memory?.['audience']);
  return {
    status: String(memory?.['status'] ?? 'active'),
    confidence: Number(memory?.['confidence'] ?? 0.8),
    persistence: String(memory?.['persistence'] ?? 'long_lived'),
    anchors: entries(memory?.['anchors'])
      .filter((a) => a['type'] === 'file')
      .map((a) => String(a['path'] ?? ''))
      .join('\n'),
    roles: Array.isArray(audience['roles']) ? audience['roles'].join(', ') : '',
    tasks: Array.isArray(audience['taskTypes']) ? audience['taskTypes'].join(', ') : '',
    modes: Array.isArray(audience['modes']) ? audience['modes'].join(', ') : '',
    validity: String(record(memory?.['validity'])['statement'] ?? ''),
    validityChecks: entries(record(memory?.['validity'])['checks']).map((check) => ({
      ...check,
      type: String(check['type'] ?? ''),
      path: String(check['path'] ?? ''),
      text: String(check['text'] ?? ''),
    })),
  };
}
export type SageEditor = ReturnType<typeof sageEditor>;
export function assertSageValiditySaved(expected: unknown, actual: unknown): void {
  const key = (value: unknown) => {
    if (value === undefined || value === null) return 'none';
    const data = record(value),
      checks = entries(data['checks']);
    if (
      typeof data['statement'] !== 'string' ||
      (data['checks'] !== undefined &&
        (!Array.isArray(data['checks']) || checks.length !== data['checks'].length))
    )
      throw Error(
        'The runtime returned malformed applicability conditions. Refresh the record before retrying.',
      );
    return JSON.stringify([
      data['statement'],
      checks.map((check) => [check['type'], check['path'], check['text']]),
    ]);
  };
  if (key(expected) !== key(actual))
    throw Error(
      'The save was acknowledged, but the stored applicability conditions differ. Your edits are retained. Refresh the record and update the runtime before retrying.',
    );
}
export function sageEditorPatch(editor: SageEditor, memory: Record<string, unknown> | null) {
  const existing = entries(memory?.['anchors']);
  if (editor.validity.length > 1000 || (editor.validityChecks.length && !editor.validity.trim()))
    throw Error('Applicability conditions require a statement of 1–1000 characters.');
  if (editor.validityChecks.length > 4)
    throw Error('Applicability supports at most four source checks.');
  for (const [index, check] of editor.validityChecks.entries()) {
    if (
      check.type !== 'source_contains' ||
      Object.keys(check).some((key) => !['type', 'path', 'text'].includes(key)) ||
      !check.path.trim() ||
      check.path.length > 500 ||
      /^[\\/]|^[a-z]:/i.test(check.path) ||
      check.path.split(/[\\/]/).some((part) => part === '..') ||
      /[\u0000-\u001f]/.test(check.path) ||
      !check.text.trim() ||
      check.text.length > 400
    )
      throw Error(
        `Source check ${index + 1} requires a project-relative path and literal text of 1–400 characters.`,
      );
  }
  return {
    ...(memory ? { status: editor.status } : {}),
    confidence: editor.confidence,
    persistence: editor.persistence,
    anchors: [
      ...existing.filter((a) => a['type'] !== 'file'),
      ...editor.anchors
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(
          (path) =>
            existing.find((a) => a['type'] === 'file' && a['path'] === path) ?? {
              type: 'file',
              path,
            },
        ),
    ],
    audience: {
      roles: words(editor.roles),
      taskTypes: words(editor.tasks),
      modes: words(editor.modes),
    },
    validity: editor.validity.trim()
      ? {
          statement: editor.validity.trim(),
          ...(editor.validityChecks.length
            ? {
                checks: editor.validityChecks.map((check) => ({
                  type: 'source_contains',
                  path: check.path.replaceAll('\\', '/'),
                  text: check.text,
                })),
              }
            : {}),
        }
      : memory
        ? null
        : undefined,
  };
}
export function fileMemories(value: unknown): Record<string, unknown>[] {
  const data = record(record(value)['response']);
  return ['primaryMatches', 'symbolMatches', 'relatedMatches'].flatMap((bucket) =>
    entries(data[bucket]).map((match) => ({
      ...record(match['memory']),
      matchedVia: match['matchedVia'],
      matchStrength: match['matchStrength'],
      pendingReview: match['pendingReview'],
    })),
  );
}
