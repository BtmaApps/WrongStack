import type { ACPClientTransport } from '../agent/stdio-transport.js';
import type { ACPMessage } from '../types/acp-messages.js';
import type { AgentCapabilities, ContentBlock, SessionId, StopReason } from '../types/acp-v1.js';
import type { State } from './acp-request-state.js';
import { emptyRunResult } from './acp-session-content.js';
import { ACPSessionError, isJsonRpcError } from './acp-session-errors.js';
import type { ACPProgressHandler, ACPSessionRunResult } from './acp-session-types.js';
import type { ACPSessionScratch } from './acp-session-updates.js';
export interface AcpSessionPromptHost {
  closed: boolean;
  state: State;
  promptCallbackAbort: AbortController | null;
  agentCapabilities: AgentCapabilities;
  sessionId: SessionId | null;
  transport: ACPClientTransport;
  createSessionWithAuth(): Promise<SessionId>;
  cancelLateSession(createPromise: Promise<SessionId>): void;
  resetScratch(): void;
  progressHandler: ACPProgressHandler | null;
  allocId(): number;
  sendRequest(id: number, method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
  timeoutMs: number;
  scratch: ACPSessionScratch;
}

export async function prompt(
  host: AcpSessionPromptHost,
  blocks: ContentBlock[],
  signal: AbortSignal,
  onProgress?: ACPProgressHandler,
): Promise<ACPSessionRunResult> {
  if (host.closed) {
    throw new ACPSessionError('closed', 'session is closed');
  }
  if (host.state !== 'ready' && host.state !== 'authenticated' && host.state !== 'done') {
    throw new ACPSessionError('protocol_error', `prompt called in state=${host.state}`);
  }
  // The state turns 'prompting' only after session creation; the live
  // controller covers that window (else a 2nd session/new goes out).
  if (host.promptCallbackAbort) {
    throw new ACPSessionError('protocol_error', 'prompt called while another prompt is running');
  }

  if (signal.aborted) {
    return emptyRunResult('cancelled');
  }

  const caps = host.agentCapabilities.promptCapabilities;
  for (const block of blocks) {
    const supported =
      block.type === 'image'
        ? caps?.image
        : block.type === 'audio'
          ? caps?.audio
          : block.type === 'resource'
            ? caps?.embeddedContext
            : true;
    if (supported !== true) {
      throw new ACPSessionError(
        'unsupported_capability',
        `agent does not support ${block.type} prompt content`,
      );
    }
  }

  // Declared early so the onAbort closure captures it (must be before
  // onAbort is defined — TDZ: const/let declarations are hoisted but
  // accessing before the line throws ReferenceError in ESM strict mode).
  let cancelled = false;

  // Create the local abort controller BEFORE the first await so that any
  // abort (user cancellation or session error) fires the listener below
  // regardless of timing. Previously this was created after createSession
  // WithAuth — an abort landing during that await was silently lost because
  // the listener hadn't been registered yet.
  host.promptCallbackAbort = new AbortController();
  const onAbort = (): void => {
    cancelled = true;
    host.promptCallbackAbort?.abort();
    if (host.sessionId) {
      host.transport
        .send({
          jsonrpc: '2.0',
          method: 'session/cancel',
          params: { sessionId: host.sessionId },
        } as never as ACPMessage)
        .catch(() => {});
    }
  };
  signal.addEventListener('abort', onAbort, { once: true });

  // Abort rejectors for the two raced phases below. Both are removed on
  // every exit path so run() never leaks a listener on the caller's signal.
  let rejectCreate: ((err: ACPSessionError) => void) | undefined;
  const onCreateAbort = (): void => {
    // With no session yet there is nothing for onAbort to cancel — drop it
    // so the catch below returns the clean cancelled result.
    signal.removeEventListener('abort', onAbort);
    rejectCreate?.(new ACPSessionError('aborted', 'prompt was aborted by the parent'));
  };

  if (!host.sessionId) {
    // Race: if abort fires during session creation, reject immediately.
    // Do NOT assign this.sessionId here — we use a local variable so the
    // catch block can tell "aborted before session existed" from "other error".
    // (If we assigned first and the race rejected, catch would try sendRequest
    // with a valid-looking sessionId that was never confirmed by the server.)
    let sessionId: string;
    // Keep the creation promise: if the abort rejection wins the race, the
    // server-side session/new may still complete afterwards. The late
    // arrival is cancelled below instead of being orphaned on the server.
    const createPromise = host.createSessionWithAuth();
    try {
      sessionId = await Promise.race([
        createPromise,
        new Promise<never>((_, reject) => {
          rejectCreate = reject;
          // No already-aborted re-check here: prompt() returns early on an
          // aborted signal, and everything between that check and this
          // executor is synchronous (createSessionWithAuth only runs its own
          // synchronous prefix before returning a pending promise), so the
          // signal cannot flip to aborted before the listener is attached.
          signal.addEventListener('abort', onCreateAbort, { once: true });
        }),
      ]);
    } catch (err) {
      // Abort won the race — the session was never adopted on our side, but
      // it may still be created server-side (cancelled below). Return a
      // clean cancelled result without calling sendRequest for the run (it
      // would throw protocol_error since this.sessionId was never set).
      // Listener teardown and controller release run here: this catch exits
      // before the turn-phase finally below ever executes — including the
      // non-abort re-throw path, so onAbort detaches here too (a no-op
      // when onCreateAbort already removed it).
      signal.removeEventListener('abort', onAbort);
      signal.removeEventListener('abort', onCreateAbort);
      rejectCreate = undefined;
      host.promptCallbackAbort?.abort();
      host.promptCallbackAbort = null;
      if (err instanceof ACPSessionError && err.kind === 'aborted') {
        // Best-effort: if the abandoned creation still completes, cancel
        // the late session so it does not leak server-side. The cancel is
        // a bounded notification send; failures surface on the warn
        // channel (cancelLateSession) instead of being swallowed.
        host.cancelLateSession(createPromise);
        return emptyRunResult('cancelled');
      }
      throw err;
    }
    signal.removeEventListener('abort', onCreateAbort);
    rejectCreate = undefined;
    // Per the ACP spec the session id is an opaque, non-empty string. This
    // is the wire trust boundary — validate before branding instead of
    // blindly casting whatever session/new returned.
    // No re-validation of sessionId here: executeCreateSession (see
    // acp-session-ops.ts) already rejects a non-string or empty id, so a
    // value that reaches this point is a non-empty string by construction.
    // This guard duplicated that check and could never fire.
    host.sessionId = sessionId as SessionId;
  }

  // Guard: an abort that raced session creation. session/new already went
  // out and the id was adopted above; whether a matching session/cancel
  // followed depends on when onAbort ran (it skips the wire send while the
  // id is unassigned). Either way the turn is over — the adopted id stays
  // for the next prompt() to reuse, and close() ends the session.
  if (signal.aborted) {
    host.promptCallbackAbort = null;
    return emptyRunResult('cancelled');
  }

  host.resetScratch();
  host.progressHandler = onProgress ?? null;

  const promptId = host.allocId();
  // Race the prompt request against the abort signal: if abort fires
  // mid-turn, onTurnAbort rejects the race so the await surfaces a clean
  // cancellation instead of the in-flight request's result — the
  // session/cancel itself goes out from onAbort. The rejector handle is
  // nullable so onTurnAbort is a no-op once the race has settled and the
  // finally below has torn the listener down.
  let rejectTurn: ((err: ACPSessionError) => void) | undefined;
  const onTurnAbort = (): void => {
    rejectTurn?.(new ACPSessionError('aborted', 'prompt was aborted by the parent'));
  };
  signal.addEventListener('abort', onTurnAbort, { once: true });
  const turnPromise = Promise.race([
    host.sendRequest(
      promptId,
      'session/prompt',
      {
        sessionId: host.sessionId,
        prompt: blocks,
      },
      host.timeoutMs,
    ),
    new Promise<never>((_, reject) => {
      rejectTurn = reject;
    }),
  ]);

  host.state = 'prompting';
  let response: unknown;
  try {
    response = await turnPromise;
  } catch (err) {
    // Every failure ends this turn: the session must land in 'done' (which
    // the entry guard admits for the next prompt), not stay stuck in
    // 'prompting' — that would brick the session after one transient
    // transport error.
    host.state = 'done';
    // `cancelled` means the outer onAbort fired during sendRequest; an
    // aborted-kind error means the inner race rejector won. Both are clean
    // cancellations, not protocol failures — return the cancelled result
    // and let the `finally` below own the listener/callback teardown.
    const abortedKind = err instanceof ACPSessionError && err.kind === 'aborted';
    if (cancelled || abortedKind) {
      return emptyRunResult('cancelled');
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (signal.aborted) {
      // The signal aborted concurrently with a real sendRequest failure;
      // report the cancellation but keep the original error as the cause
      // instead of masking it.
      throw new ACPSessionError('aborted', 'prompt was aborted by the parent', err);
    }
    throw new ACPSessionError('prompt_failed', `session/prompt failed: ${msg}`, err);
  } finally {
    signal.removeEventListener('abort', onAbort);
    signal.removeEventListener('abort', onTurnAbort);
    signal.removeEventListener('abort', onCreateAbort);
    rejectTurn = undefined;
    rejectCreate = undefined;
    host.promptCallbackAbort?.abort();
    host.promptCallbackAbort = null;
    host.progressHandler = null;
  }

  host.state = 'done';
  if (isJsonRpcError(response)) {
    throw new ACPSessionError('prompt_failed', `agent error: ${response.message}`, response);
  }
  const stopReason = (response as { stopReason?: StopReason }).stopReason ?? 'end_turn';
  const finalText = host.scratch.text;
  return {
    text: finalText,
    stopReason,
    hasText: finalText.length > 0,
    usage: host.scratch.usage,
    plan: host.scratch.plan,
    toolCalls: [...host.scratch.toolCalls.values()],
    diffs: host.scratch.diffs,
    thoughts: host.scratch.thoughts,
  };
}
