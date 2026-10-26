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
  };
}
export type SageEditor = ReturnType<typeof sageEditor>;
export function sageEditorPatch(editor: SageEditor, memory: Record<string, unknown> | null) {
  const existing = entries(memory?.['anchors']);
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
      ? { ...record(memory?.['validity']), statement: editor.validity.trim() }
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
