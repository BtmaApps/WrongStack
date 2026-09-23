import { useEffect, useRef, useState } from 'react';
import {
  classifyOutage,
  OUTAGE_GRACE_MS,
  OUTAGE_PROBE_INTERVAL_MS,
  type OutageKind,
  probeServer,
} from '../lib/server-health.js';
import type { ConnectionState } from '../types.js';

export interface UseServerOutageResult {
  /** `'none'` while the connection is healthy or still inside the grace
   *  window; otherwise the classified outage. */
  outage: OutageKind;
  /** True after the user dismissed the overlay for the current outage
   *  episode. Resets when the connection reopens. */
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * Watches the WebSocket connection state and, once it has been non-open for
 * longer than {@link OUTAGE_GRACE_MS}, probes the HTTP origin to classify
 * the outage. Keeps re-probing while the connection stays down so the
 * overlay heals itself (e.g. 'server-gone' → 'none' after a restart is
 * picked up by the WS reconnect loop, or → 'ws-blocked' when HTTP returns
 * before the socket does).
 */
export function useServerOutage(connection: ConnectionState): UseServerOutageResult {
  const [outage, setOutage] = useState<OutageKind>('none');
  const [dismissed, setDismissed] = useState(false);
  // Generation counter: bumped on every connection change so a probe that
  // resolves after the connection reopened cannot resurrect the overlay.
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (connection === 'open') {
      setOutage('none');
      setDismissed(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      const result = await probeServer();
      if (generationRef.current !== generation) return;
      setOutage(classifyOutage(result));
      timer = setTimeout(() => void probe(), OUTAGE_PROBE_INTERVAL_MS);
    };
    timer = setTimeout(() => void probe(), OUTAGE_GRACE_MS);
    return () => {
      clearTimeout(timer);
      // Unmount must also invalidate the generation: an in-flight probe
      // resolving after teardown would otherwise pass the equality check,
      // re-arm the timer post-cleanup, and leak an endless probe/timer
      // chain. (On a plain `connection` change the re-run effect bumps the
      // generation again — one skipped number is harmless.)
      generationRef.current += 1;
    };
  }, [connection]);

  return { outage, dismissed, dismiss: () => setDismissed(true) };
}
