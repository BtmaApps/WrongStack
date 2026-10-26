/** Small graph/list cards. Full SAGE records remain behind the explicit get action. */
export function sageMemorySummary(value: unknown): Record<string, unknown> {
  const memory = value as Record<string, unknown>;
  return {
    id: memory['id'],
    kind: memory['kind'],
    status: memory['status'],
    scope: memory['scope'],
    revision: memory['revision'],
    importance: memory['importance'],
    preview: String(memory['text'] ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 120),
    tags: Array.isArray(memory['tags']) ? memory['tags'].slice(0, 8) : [],
    anchorCount: Array.isArray(memory['anchors']) ? memory['anchors'].length : 0,
    sourceCount: Array.isArray(memory['sources']) ? memory['sources'].length : 0,
  };
}
