import { MAX_LANES } from './chat-lanes';

/** The persisted tab strip: the four-slot ceiling and its localStorage record. */

export const MAX_OPEN_TABS = MAX_LANES;
export const TAB_STORAGE_KEY = 'wrongstack.open_session_tabs';

export function readStoredTabs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, MAX_OPEN_TABS);
  } catch {
    return [];
  }
}

export function writeStoredTabs(tabs: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabs.slice(0, MAX_OPEN_TABS)));
  } catch {
    // ignore
  }
}
