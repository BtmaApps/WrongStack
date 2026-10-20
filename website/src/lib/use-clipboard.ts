import { useEffect, useRef, useState } from 'react';

/** Copy feedback also covers denied permissions; timers never outlive the control. */
export function useClipboard() {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [lastValue, setLastValue] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
      clearTimeout(timer.current);
    };
  }, []);
  const copy = async (value: string) => {
    const id = ++request.current;
    clearTimeout(timer.current);
    let next: 'copied' | 'error';
    try {
      await navigator.clipboard.writeText(value);
      next = 'copied';
    } catch {
      next = 'error';
    }
    if (!mounted.current || request.current !== id) return;
    setLastValue(value);
    setStatus(next);
    timer.current = setTimeout(() => setStatus('idle'), 2400);
  };
  return {
    copy,
    copied: status === 'copied',
    copiedValue: status === 'copied' ? lastValue : null,
    message:
      status === 'copied'
        ? 'Copied to clipboard.'
        : status === 'error'
          ? 'Copy unavailable. Select and copy the text manually.'
          : '',
  };
}
