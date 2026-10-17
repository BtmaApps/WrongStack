'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Mode = 'simple' | 'extended';
const Presentation = createContext<{ mode: Mode; setMode: (mode: Mode) => void }>({
  mode: 'simple',
  setMode: () => {},
});
export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [mode, update] = useState<Mode>('simple');
  useEffect(() => {
    try {
      if (localStorage.getItem('wrongstack.vibeui.detail') === 'extended') update('extended');
    } catch {}
  }, []);
  const setMode = useCallback((value: Mode) => {
    update(value);
    try {
      localStorage.setItem('wrongstack.vibeui.detail', value);
    } catch {}
  }, []);
  return <Presentation.Provider value={{ mode, setMode }}>{children}</Presentation.Provider>;
}
export const usePresentation = () => useContext(Presentation);
export function DetailSwitch() {
  const { mode, setMode } = usePresentation();
  return (
    <fieldset className="detail-switch" aria-label="Detail level">
      <button
        type="button"
        title="Clear summaries and essential controls"
        aria-pressed={mode === 'simple'}
        onClick={() => setMode('simple')}
      >
        Simple
      </button>
      <button
        type="button"
        title="Full technical details, metadata and advanced controls"
        aria-pressed={mode === 'extended'}
        onClick={() => setMode('extended')}
      >
        Extended
      </button>
    </fieldset>
  );
}
