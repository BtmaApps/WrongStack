'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

export const AMBIENT_MOTION_STORAGE_KEY = 'wrongstack-ambient-motion';
type Preference = 'system' | 'on' | 'off';
const readPreference = (value: string | null): Preference =>
  value === 'on' || value === 'off' ? value : 'system';

const AmbientMotionContext = createContext({
  enabled: true,
  ready: true,
  preference: 'system' as Preference,
  toggle: () => {},
});

export const useAmbientMotion = () => useContext(AmbientMotionContext);

export function AmbientMotionProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>('system');
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPreference(readPreference(localStorage.getItem(AMBIENT_MOTION_STORAGE_KEY)));
    } catch {
      // The control remains usable when browser storage is unavailable.
    }
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setReady(true);
    const storage = (event: StorageEvent) => {
      if (event.key === AMBIENT_MOTION_STORAGE_KEY || event.key === null) {
        setPreference(readPreference(event.newValue));
      }
    };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, []);

  useEffect(() => {
    if (!ready || preference !== 'system') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const change = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [preference, ready]);

  const enabled = ready && (preference === 'system' ? !reduced : preference === 'on');
  const toggle = () => {
    const next = enabled ? 'off' : 'on';
    setPreference(next);
    try {
      localStorage.setItem(AMBIENT_MOTION_STORAGE_KEY, next);
    } catch {
      // Session state still works in private or restricted browser contexts.
    }
  };

  return (
    <AmbientMotionContext.Provider value={{ enabled, ready, preference, toggle }}>
      {children}
    </AmbientMotionContext.Provider>
  );
}
