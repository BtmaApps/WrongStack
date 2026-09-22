import { useCallback, useRef } from 'react';
import type { KeyEvent } from '../components/input.js';

type AppKeyHandler = (input: string, key: KeyEvent) => Promise<void>;

/**
 * Returns an identity-stable key handler that always calls the latest
 * `handleKey`. A rejected key handler must never kill the process, but it
 * must not vanish either: `onError` receives the failure so the host can
 * surface it (an error entry in the transcript). Without `onError` the
 * failure is still contained.
 */
export function useStableKeyHandler(
  handleKey: AppKeyHandler,
  onError?: (err: unknown) => void,
): AppKeyHandler {
  const handleKeyRef = useRef<AppKeyHandler | null>(null);
  handleKeyRef.current = handleKey;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  return useCallback((input: string, key: KeyEvent) => {
    let work: Promise<void> | undefined;
    try {
      work = handleKeyRef.current?.(input, key);
    } catch (err) {
      reportKeyError(onErrorRef.current, err);
      return Promise.resolve();
    }
    work?.catch((err: unknown) => reportKeyError(onErrorRef.current, err));
    return Promise.resolve();
  }, []);
}

function reportKeyError(onError: ((err: unknown) => void) | undefined, err: unknown): void {
  try {
    onError?.(err);
  } catch {
    // The reporter itself failed; containment wins over reporting.
  }
}
