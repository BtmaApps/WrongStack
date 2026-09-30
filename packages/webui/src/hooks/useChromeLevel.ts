import { useLocalPrefs } from '@/stores/local-prefs';

/**
 * Workbench chrome density (Settings → Display → "Calm / Full").
 *
 * `calm` shows each figure in ONE place and tucks secondary controls behind
 * menus; `full` renders every duplicate and loose control the workbench had
 * before the calm pass. Components gate their redundant chrome on
 * `useIsFullChrome()` rather than reading the pref themselves, so flipping the
 * setting back to `full` is a guaranteed return to the old screen.
 */
export function useChromeLevel(): 'calm' | 'full' {
  return useLocalPrefs((s) => s.chromeLevel);
}

/** True when the user asked for the full (pre-calm) workbench chrome. */
export function useIsFullChrome(): boolean {
  return useLocalPrefs((s) => s.chromeLevel === 'full');
}
