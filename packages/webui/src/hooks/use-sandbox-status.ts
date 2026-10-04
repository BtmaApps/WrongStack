import { useEffect, useState } from 'react';
import { formatSandboxStatusLine, type SandboxStatusLite } from '@/lib/sandbox-status';

/**
 * Polls GET /api/sandbox/status (read-only, unauthenticated by design) and
 * returns the formatted active-tier line for the Sessions/Settings chip.
 * Mirrors the house status-light pattern (poll + derived label, fail-open).
 */
export function useSandboxStatus(pollMs = 5000): string {
  const [line, setLine] = useState('sandbox: off');

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/sandbox/status');
        if (!res.ok || !alive) return;
        const body = (await res.json()) as { sandbox?: SandboxStatusLite };
        if (body.sandbox && alive) setLine(formatSandboxStatusLine(body.sandbox));
      } catch {
        // fail-open: keep the last known line
      }
    };
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollMs]);

  return line;
}
