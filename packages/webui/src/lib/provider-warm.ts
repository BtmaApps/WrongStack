/**
 * Warm the session's provider connection while the user types (`composer.warm`,
 * capability `session.provider-warm`), so DNS and TLS are done before the
 * send. The server throttles per endpoint as well; this only keeps a burst of
 * keystrokes from becoming a burst of frames.
 */
import { useConfigStore } from '@/stores';
import { getWSClient } from './ws-client';

const CAPABILITY = 'session.provider-warm';
/** At most one warm frame per session this often. */
const MIN_GAP_MS = 2_000;

const lastSentAt = new Map<string, number>();

/** Composer text changed in `sessionId` while no turn is running there. */
export function warmProviderWhileTyping(sessionId: string, text: string, now = Date.now()): void {
  const trimmed = text.trimStart();
  // `/commands` and `!shell` lines never reach the model.
  if (!sessionId || !trimmed || trimmed.startsWith('/') || trimmed.startsWith('!')) return;
  const last = lastSentAt.get(sessionId);
  if (last !== undefined && now - last < MIN_GAP_MS) return;
  const ws = getWSClient(useConfigStore.getState().wsUrl);
  if (!ws.isConnected || !ws.supportsCapability(CAPABILITY)) return;
  if (ws.send({ type: 'composer.warm', payload: { sessionId } })) lastSentAt.set(sessionId, now);
}
