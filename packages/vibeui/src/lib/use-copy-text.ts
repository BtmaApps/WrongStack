'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useCopyText(identity: string) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    generation.current++;
    setStatus('idle');
    return () => {
      generation.current++;
      clearTimeout(timer.current);
    };
  }, [identity]);
  const copy = useCallback(async (value: string) => {
    const owner = ++generation.current;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      if (owner !== generation.current) return;
      setStatus('copied');
    } catch {
      if (owner !== generation.current) return;
      setStatus('error');
    }
    timer.current = setTimeout(() => {
      if (owner === generation.current) setStatus('idle');
    }, 4000);
  }, []);
  return { status, copy };
}
