import { useLocalPrefs } from '@/stores/local-prefs';

/** True when the user asked for the full (pre-calm) workbench chrome. */
export function useIsFullChrome(): boolean {
  return useLocalPrefs((s) => s.chromeLevel === 'full');
}
