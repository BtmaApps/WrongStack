import type { Session } from './model';

export function restoreSessionTabs(saved: Record<string, unknown>, sessions: Session[]): string[] {
  const known = new Set(sessions.map((s) => s.id));
  const candidates = Array.isArray(saved['openSessionIds']) ? saved['openSessionIds'] : [];
  const ids = candidates.filter((id): id is string => typeof id === 'string' && known.has(id));
  if (typeof saved['selected'] === 'string' && known.has(saved['selected']))
    ids.push(saved['selected']);
  return [...new Set(ids)];
}
export function nextSessionAfterDetach(
  open: string[],
  selected: string | null,
  closed: string,
): string | null {
  if (selected !== closed) return selected;
  const index = open.indexOf(closed);
  const remaining = open.filter((id) => id !== closed);
  return remaining[Math.min(Math.max(index, 0), remaining.length - 1)] ?? null;
}
