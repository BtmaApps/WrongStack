import type { ServerMessage } from '../types.js';

import type { MessageHandlerDeps } from './message-handler-deps.js';

import { enqueuePendingUserInput, resolvePendingUserInput } from './user-input-queue.js';

/** Narrowed to exactly the surface this module touches (see the slices in
 *  message-handler-deps.ts) — the factory passes the full deps object. */
export type ContextMessageDeps = Pick<
  MessageHandlerDeps,
  'setContext' | 'setSession' | 'setPendingConfirm' | 'setUserInputRequests'
>;

export function handleContextMessage(message: ServerMessage, deps: ContextMessageDeps): void {
  const { setContext, setSession, setPendingConfirm, setUserInputRequests } = deps;
  const payload = message.payload ?? {};
  switch (message.type) {
    case 'stats.get': {
      // Server-side session stats carry both the cumulative prompt-cache
      // figures and the per-request `currentRequest.cacheRead` snapshot.
      // Coverage must come from the per-request figure — `usage.cacheRead`
      // is cumulative across the whole session and would mislead the
      // "cache covers the first N tokens of THIS prompt" indicator.
      // Defensive parse: the reply arrives as `Record<string, unknown>`,
      // so every field is coerced through a finite-number guard rather
      // than cast.
      const payload = message.payload;
      const usage = payload['usage'];
      const cache = payload['cache'];
      const currentRequest = payload['currentRequest'];
      if (usage && typeof usage === 'object' && cache && typeof cache === 'object') {
        const c = cache as Record<string, unknown>;
        const currentRequestCacheRead =
          currentRequest && typeof currentRequest === 'object'
            ? finiteNumber((currentRequest as Record<string, unknown>)['cacheRead'])
            : 0;
        const readTokens = finiteNumber(c['readTokens']);
        const writeTokens = finiteNumber(c['writeTokens']);
        const hitRatioRaw = c['hitRatio'];
        const hitRatio =
          typeof hitRatioRaw === 'number' && Number.isFinite(hitRatioRaw) ? hitRatioRaw : 0;
        setContext((current) => ({
          ...current,
          // Coverage is the per-request snapshot, capped at the live
          // request size so the figure never overshoots what is
          // actually being sent. Falls back to 0 when the server
          // omits `currentRequest` (older clients, or before the
          // server-side addition in `introspection-routes.ts`).
          cache: {
            readTokens,
            writeTokens,
            hitRatio,
            coverageTokens: Math.max(0, Math.min(current.tokens, currentRequestCacheRead)),
          },
        }));
      }
      break;
    }

    case 'ctx.pct': {
      setContext((prev) => ({
        // `load` is emitted as a 0-1 fraction of the context budget
        // (e.g. 0.68 = 68%); values > 1 mean the budget is overflowed
        // (e.g. 1.35 = 135%). See core `ctx.pct` emit + agent-status
        // tracker. Never magnitude-sniff/divide — that corrupted genuine
        // overflow values (1.35 -> 0.0135). Just clamp negatives to 0.
        load: normalizeContextLoad(payload['load']),
        tokens: finiteNumber(payload['tokens']),
        maxContext: finiteNumber(payload['maxContext']),
        // `ctx.pct` does not carry cache stats — keep whatever the
        // `stats.get` handler most recently wrote. Going `null` here
        // would erase a valid reading on every per-request tick.
        cache: prev.cache,
      }));
      break;
    }

    case 'ctx.max_context': {
      const maxContext = finiteNumber(payload['maxContext']);
      setContext((current) => ({ ...current, maxContext }));
      setSession((current) => (current ? { ...current, maxContext } : current));
      break;
    }

    case 'tool.confirm_needed':
      if (typeof payload['id'] === 'string') {
        setPendingConfirm({
          id: payload['id'],
          toolName: typeof payload['toolName'] === 'string' ? payload['toolName'] : 'tool',
          input: payload['input'],
          riskTier: typeof payload['riskTier'] === 'string' ? payload['riskTier'] : undefined,
          deadlineAt: typeof payload['deadlineAt'] === 'number' ? payload['deadlineAt'] : undefined,
        });
      }
      break;

    case 'tool.confirm_resolved':
      if (typeof payload['id'] === 'string') {
        setPendingConfirm((current) => (current?.id === payload['id'] ? null : current));
      }
      break;

    case 'user.input_requested': {
      const request = payload['request'];
      if (
        request &&
        typeof request === 'object' &&
        typeof (request as { id?: unknown }).id === 'string'
      ) {
        const entry = {
          request: request as import('../types.js').UserInputRequest,
          ...(typeof payload['sessionId'] === 'string' ? { sessionId: payload['sessionId'] } : {}),
        };
        setUserInputRequests?.((current) => enqueuePendingUserInput(current, entry));
      }
      break;
    }

    case 'user.input_resolved': {
      const requestId = payload['requestId'];
      if (typeof requestId === 'string') {
        setUserInputRequests?.((current) => resolvePendingUserInput(current, requestId));
      }
      break;
    }
  }
}

import { finiteNumber, normalizeContextLoad } from './context-load.js';
