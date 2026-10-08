import { messageSessionId } from '@/lib/ws-client-utils';
import { useLeaderEffortStore } from '@/stores/leader-effort-store';
import type { WSServerMessage } from '@/types';

/** `leader.effort_changed` — the leader changed (or reset) its own effort for a tab. */
export function handleLeaderEffortChanged(msg: WSServerMessage) {
  // Keyed by the session the message names, never the tab in front.
  const sessionId = messageSessionId(msg);
  if (!sessionId) return;
  const payload = (msg.payload ?? {}) as {
    effort?: string | null | undefined;
    reason?: string | undefined;
  };
  useLeaderEffortStore.getState().record(sessionId, payload.effort ?? undefined, payload.reason);
}
