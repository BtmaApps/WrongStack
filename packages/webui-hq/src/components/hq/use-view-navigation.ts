import { useEffect } from 'react';
import { type HqViewId, useHqStore } from '../../data/store/index.js';
import { HQ_VIEWS } from './views.js';

/** Only our view fragment belongs to the router; bootstrap and other hashes do not. */
export function hqViewFromHash(hash: string): HqViewId | null {
  if (!hash.startsWith('#/')) return null;
  return HQ_VIEWS.find((view) => hash === `#/${view.id}`)?.id ?? 'cockpit';
}

/** Keep all navigation callers, reloads and browser history on the same route. */
export function useViewNavigation(): void {
  useEffect(() => {
    const initial = hqViewFromHash(window.location.hash);
    if (initial !== null) useHqStore.getState().setActiveView(initial);
    if (window.location.hash === '' || initial !== null) {
      window.history.replaceState(
        window.history.state,
        '',
        `#/${useHqStore.getState().activeView}`,
      );
    }

    const readLocation = (): void => {
      const view = window.location.hash === '' ? 'cockpit' : hqViewFromHash(window.location.hash);
      if (view !== null) useHqStore.getState().setActiveView(view);
    };
    const unsubscribe = useHqStore.subscribe((state, previous) => {
      if (state.activeView === previous.activeView) return;
      const hash = `#/${state.activeView}`;
      if (window.location.hash === hash) return;
      window.history.pushState(window.history.state, '', hash);
    });
    window.addEventListener('popstate', readLocation);
    window.addEventListener('hashchange', readLocation);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', readLocation);
      window.removeEventListener('hashchange', readLocation);
    };
  }, []);
}
