import { useCallback, useEffect, useRef } from 'react';
import type { useWebSocket } from '@/hooks/useWebSocket';

export type SkillsWsClient = ReturnType<typeof useWebSocket>['client'];
export type ListenOnce = (
  type: string,
  onMsg: (msg: unknown) => void,
  onTimeout: () => void,
  timeoutMs?: number,
) => void;

/** One-shot WS reply listener used by the skills install/create/export actions. */
export function useSkillsOneShotListener(client: SkillsWsClient): ListenOnce {
  // One-shot WS listeners (install/create/export). Tracked in a ref so that:
  //   - a timeout clears the busy state when the server never replies,
  //   - unmount tears the listener down (no setState-after-unmount),
  //   - a rapid second click replaces (not stacks) the pending listener.
  const oneShotOffs = useRef(new Map<string, () => void>());
  useEffect(() => {
    const offs = oneShotOffs.current;
    return () => {
      for (const off of offs.values()) off();
      offs.clear();
    };
  }, []);

  return useCallback(
    (type: string, onMsg: (msg: unknown) => void, onTimeout: () => void, timeoutMs = 15_000) => {
      if (!client) return;
      oneShotOffs.current.get(type)?.();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const handler = (msg: unknown) => {
        dispose();
        onMsg(msg);
      };
      const dispose = () => {
        if (timer) clearTimeout(timer);
        client.off(type, handler as (msg: unknown) => void);
        oneShotOffs.current.delete(type);
      };
      timer = setTimeout(() => {
        dispose();
        onTimeout();
      }, timeoutMs);
      client.on(type, handler as (msg: unknown) => void);
      oneShotOffs.current.set(type, dispose);
    },
    [client],
  );
}
