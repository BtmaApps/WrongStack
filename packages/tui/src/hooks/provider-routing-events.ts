import type { Dispatch } from 'react';
import type { Action } from '../app-action-type.js';
import type { AppProps } from '../app-props.js';

/**
 * Subscribe the transcript to provider routing events: retries, errors,
 * fallback hops, explicit and server-side model switches, and the fallback
 * gate's pending prompt. Returns one unsubscribe for all of them.
 */
export function subscribeProviderRoutingEvents(
  events: AppProps['events'],
  {
    agent,
    dispatch,
    discardAbandonedStream,
  }: {
    agent: AppProps['agent'];
    dispatch: Dispatch<Action>;
    /** Drop a partial stream a retry or fallback hop is about to re-send. */
    discardAbandonedStream: () => void;
  },
): () => void {
  const offRetry = events.on('provider.retry', (e) => {
    discardAbandonedStream();
    const secs = (e.delayMs / 1000).toFixed(e.delayMs >= 1000 ? 1 : 2);
    dispatch({
      type: 'addEntry',
      entry: { kind: 'warn', text: `⟳ retry ${e.attempt} in ${secs}s — ${e.description}` },
    });
  });
  const offProvErr = events.on('provider.error', (e) => {
    dispatch({
      type: 'addEntry',
      entry: { kind: 'error', text: e.description },
    });
  });
  // Fallback hop — the chain rotated to a working model after the primary's
  // retries were exhausted. Surface which model is now answering.
  const offFallback = events.on('provider.fallback', (e) => {
    discardAbandonedStream();
    const warning = e.contextWindowWarning;
    dispatch({
      type: 'addEntry',
      entry: {
        kind: 'model-switch',
        cause: 'fallback',
        fromProvider: e.from.providerId,
        fromModel: e.from.model,
        toProvider: e.to.providerId,
        toModel: e.to.model,
        fromContext: warning?.fromMaxContext,
        toContext: warning?.toMaxContext,
        requestTokens: warning?.currentTokens,
        runActive: true,
        status: e.status,
      },
    });
  });
  // Explicit model switch (e.g. /model or settings)
  const offModelSwitched = events.on('provider.model_switched', (e) => {
    const from = e.from ? `${e.from.providerId}/${e.from.model}` : '';
    const to = `${e.to.providerId}/${e.to.model}`;
    dispatch({
      type: 'addEntry',
      entry: {
        kind: 'info',
        text: from ? `🔄 Model changed: ${from} → ${to}` : `🔄 Model set to ${to}`,
      },
    });
  });
  // The backend itself answered with another model (e.g. a ChatGPT account
  // flagged for cyber-risk is routed to a fallback). Emitted once per change.
  const offModelRerouted = events.on('provider.model_rerouted', (e) => {
    if (typeof e.sessionId === 'string' && e.sessionId !== agent.ctx.session.id) return;
    dispatch({
      type: 'addEntry',
      entry: {
        kind: 'warn',
        text: `⚠ Server answered with ${e.served} instead of ${e.requested}${e.reason ? ` — ${e.reason}` : ''}`,
      },
    });
  });
  // Fallback gate — BEFORE the chain iterates, the gate emits
  // provider.fallback_pending so the UI can show a modal with a
  // countdown and manual model selection. The overlay dispatches
  // fallbackOverlayOpen; when the user picks a model or the countdown
  // expires, app-view emits provider.fallback_choice on the EventBus
  // and the gate resolves.
  const offFallbackPending = events.on('provider.fallback_pending', (e) => {
    // Session guard — don't open the overlay for events from other sessions.
    const eventSessionId = (e as { sessionId?: unknown }).sessionId;
    if (typeof eventSessionId === 'string' && eventSessionId !== agent.ctx.session.id) return;
    const candidates = Array.isArray(e.candidates)
      ? e.candidates.map((c) => ({
          providerId: String(c.providerId ?? ''),
          model: String(c.model ?? ''),
        }))
      : [];
    dispatch({
      type: 'fallbackOverlayOpen',
      info: {
        requestId: String(e.requestId ?? ''),
        from: {
          providerId: String(e.from?.providerId ?? ''),
          model: String(e.from?.model ?? ''),
        },
        status: typeof e.status === 'number' ? e.status : 0,
        candidates,
        autoSwitchSeconds: typeof e.autoSwitchSeconds === 'number' ? e.autoSwitchSeconds : 7,
        selected: 0,
      },
    });
  });
  return () => {
    offRetry();
    offProvErr();
    offFallback();
    offModelSwitched();
    offModelRerouted();
    offFallbackPending();
  };
}
