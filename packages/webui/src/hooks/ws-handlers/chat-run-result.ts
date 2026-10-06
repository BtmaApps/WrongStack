import { expectDefined } from '@wrongstack/core/utils/expect-defined';
import { parseNextSteps } from '@wrongstack/tools/next-steps';
import { toWireImages } from '@/components/ChatInput/image-attachments';
import { toast } from '@/components/Toaster';
import { buildBugHuntContinuation, buildBugHuntMessage } from '@/lib/bug-hunt-message';
import { playCompletionChime } from '@/lib/chime';
import { setFaviconStatus } from '@/lib/favicon';
import { ensureNotificationPermission, notifyIfHidden } from '@/lib/notify';
import { streamCoalescer } from '@/lib/stream-coalescer';
import { getWSClient } from '@/lib/ws-client';
import { chatFor, safePayload, sessionFor } from '@/lib/ws-client-utils';
import { useConfigStore, useSessionStore, useSessionTabStore } from '@/stores';
import { useBugHuntRunStore } from '@/stores/bug-hunt-run-store';
import type { ChatLaneActions } from '@/stores/chat-lanes';
import type { QueuedItem } from '@/stores/chat-store';
import type { WSServerMessage } from '@/types';
import { completedToolNextSteps, isForeground, runTag, tabLabel } from './chat-run-state.js';

/**
 * A run a provider killed after its own retries, on a failure a later attempt
 * usually gets through: a `PROVIDER_*` code the provider marked recoverable
 * (rate limit, overload, 5xx, dropped connection). The only run failure the
 * Continue countdown may auto-fire for. A recoverable non-provider failure is
 * not one — a context overflow would overflow again, and the loop guard or
 * iteration limit stopped the run on purpose.
 *
 * Only a `failed` run qualifies. A run the user stopped comes back `aborted`,
 * and its error is whatever the provider threw when the signal cut the request
 * (a dropped stream reads as a recoverable `PROVIDER_NETWORK_ERROR`) — judged
 * by the error alone, Stop armed a countdown that restarted the run.
 */
export function isAutoContinuableRunError(
  error: { code?: string | undefined; recoverable?: boolean | undefined } | undefined,
  status: string,
): boolean {
  if (status !== 'failed') return false;
  if (error?.recoverable !== true) return false;
  const code = error.code ?? '';
  return code.startsWith('PROVIDER_') && code !== 'PROVIDER_CONTEXT_OVERFLOW';
}

export function handleRunResult(msg: WSServerMessage) {
  const chat = chatFor(msg);
  if (!chat) return;
  const payload = safePayload<{
    requestId?: string;
    status: string;
    iterations?: number;
    finalText?: string;
    error?: { code?: string; message: string; recoverable: boolean };
  }>(
    msg,
    { status: 'string' },
    {
      requestId: 'string',
      iterations: 'number',
      finalText: 'string',
      error: 'object',
    },
  );
  if (!payload) return;
  const bugHuntRuns = useBugHuntRunStore.getState();
  const activeBugHunt = bugHuntRuns.runs[chat.sessionId];
  // A duplicated or late result from the previous round must not finalize the
  // continuation that already owns this session. Generic runs have no entry,
  // and recovered hunts use `null` until their first result is claimed.
  if (
    activeBugHunt?.requestId &&
    payload.requestId !== undefined &&
    !bugHuntRuns.ownsRequest(chat.sessionId, payload.requestId)
  ) {
    return;
  }
  // iterations is optional on the wire (some server builds omit it on
  // early-exit paths); default to 1 so downstream math + copy stays sane.
  const iterations = payload.iterations ?? 1;
  streamCoalescer.flushAll();
  chat.flushThinkingLog(Math.max(1, iterations));
  const meta = sessionFor(msg);
  meta?.setIteration(null);
  chat.setLoading(false);
  // Finalize the streaming assistant message so the UI stops showing the
  // typing indicator. Previously the message stayed `streaming: true` even
  // after run.result, leaving a perpetual "typing…" bubble if no later
  // message superseded it.
  const streamingId = chat.currentAssistantMessageId;
  const finalText = payload.status === 'done' ? payload.finalText?.trim() : undefined;
  if (streamingId) {
    const streamed = chat.messages.find((m) => m.id === streamingId);
    chat.updateMessage(streamingId, {
      content: streamed?.content?.trim()
        ? streamed.content
        : (finalText ?? streamed?.content ?? ''),
    });
    // The run is over — this is the turn's final answer, so its suggestions
    // are the ones the user should see.
    chat.finalizeMessage(streamingId, { final: true });
  } else if (finalText) {
    // Defensive fallback: a run may complete with finalText even if the live
    // text_delta/provider.response path failed to create a visible assistant
    // bubble. provider.response normally finalized the reply first, though,
    // so compare against both the raw final text and its visible (nextsteps-
    // stripped) form before adding anything. Otherwise the same reply lands
    // twice, with the fallback copy still exposing the raw XML block.
    const runStart = chat.runStart;
    const visibleFinalText = parseNextSteps(finalText).stripped.trim();
    const messages = chat.messages;
    let lastRunAssistant: (typeof messages)[number] | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (candidate?.role === 'assistant' && (!runStart || candidate.timestamp >= runStart.at)) {
        lastRunAssistant = candidate;
        break;
      }
    }
    const existingContent = lastRunAssistant?.content.trim();
    const hasSameFinalText =
      existingContent !== undefined &&
      (existingContent === finalText || existingContent === visibleFinalText);
    if (!hasSameFinalText) {
      const messageId = chat.addMessage({ role: 'assistant', content: finalText });
      chat.finalizeMessage(messageId, { final: true });
    }
  }
  // Bug Hunter owns the next turn while it is active. Showing the generic
  // next-step bar here invites a second, manual request (usually "start round
  // 2") before the bounded loop has advanced its own request id. That leaves
  // the sidebar on the old round and races the continuation against a normal
  // chat run. A hunt either submits its continuation below or clears itself;
  // it never exposes the generic next-step automation between rounds.
  const laneNextStepSuggestions = completedToolNextSteps.get(chat.sessionId) ?? [];
  if (activeBugHunt) {
    // Do not leave the completed tool result around to resurface after the
    // final hunt round or on a later ordinary chat turn.
    completedToolNextSteps.delete(chat.sessionId);
  } else if (payload.status === 'done' && laneNextStepSuggestions.length > 0) {
    // Only THIS run's reply can already carry these steps (from its own
    // `<nextsteps>` block). Scanning the whole history meant the first turn
    // that ever rendered chips suppressed the tool-provided suggestions of
    // every turn after it.
    const runStartedAt = chat.runStart?.at;
    const hasRenderedSuggestions = chat.messages.some(
      (message) =>
        message.role === 'assistant' &&
        (message.nextSteps?.steps.length ?? 0) > 0 &&
        (runStartedAt === undefined || message.timestamp >= runStartedAt),
    );
    if (!hasRenderedSuggestions) {
      chat.addMessage({
        role: 'assistant',
        content: '',
        nextSteps: { steps: laneNextStepSuggestions },
      });
    }
    completedToolNextSteps.delete(chat.sessionId);
  }
  chat.setCurrentAssistantMessage(null);
  chat.clearThinking();
  const runStart = chat.runStart;
  if (runStart && payload.status === 'done') {
    const all = chat.messages;
    let lastAssistantIdx = -1;
    let toolCount = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const m = expectDefined(all[i]);
      if (m.role === 'assistant' && lastAssistantIdx === -1 && m.content) lastAssistantIdx = i;
      if (m.role === 'tool' && m.timestamp >= runStart.at) toolCount += 1;
      if (m.role === 'user' && m.timestamp <= runStart.at) break;
    }
    if (lastAssistantIdx !== -1) {
      const sessionCost = meta?.data.cost ?? 0;
      chat.updateMessage(expectDefined(all[lastAssistantIdx]).id, {
        runSummary: {
          iterations,
          tools: toolCount,
          durationMs: Date.now() - runStart.at,
          costDelta: Math.max(0, sessionCost - runStart.cost),
        },
      });
    }
  }
  chat.setRunStart(null);

  if (payload.status !== 'done') {
    bugHuntRuns.stop(chat.sessionId, payload.requestId);
  } else {
    const nextRound = bugHuntRuns.advance(chat.sessionId, payload.requestId);
    if (nextRound) {
      const summary = {
        scope: nextRound.scope,
        maxBugs: nextRound.totalRounds,
        currentRound: nextRound.currentRound,
      };
      const continuation = buildBugHuntMessage(buildBugHuntContinuation(summary), summary);
      const requestId = getWSClient(useConfigStore.getState().wsUrl).sendMessage(
        continuation,
        undefined,
        false,
        chat.sessionId,
      );
      if (!requestId) {
        bugHuntRuns.stop(chat.sessionId);
        chat.addMessage({
          role: 'assistant',
          content: 'Proof-Driven Bug Hunter stopped because the next round could not be submitted.',
          isError: true,
        });
      } else {
        bugHuntRuns.setRequestId(chat.sessionId, requestId);
        chat.addMessage({ role: 'user', content: continuation, bugHunt: summary });
        chat.setLoading(true);
        // The bug-hunt continuation owns the next turn; do not let ordinary
        // suggestions or a queued prompt race this one into the same session.
        return;
      }
    }
  }

  if (payload.status !== 'done' && payload.error) {
    if (payload.requestId) {
      chat.updateMessage(payload.requestId, { status: 'failed' });
    }
    chat.addMessage({
      role: 'assistant',
      content: `Error: ${payload.error.message}`,
      isError: true,
      ...(isAutoContinuableRunError(payload.error, payload.status) ? { autoContinue: true } : {}),
    });
    const isSilentAbort =
      payload.status === 'aborted' ||
      payload.error.message === 'User aborted' ||
      payload.error.message === 'aborted';
    const foreground = isForeground(chat);
    if (!isSilentAbort) {
      // A toast is a foreground interruption with no room to say WHICH
      // conversation failed, so a background tab's failure reads as this
      // tab's. Its own transcript already carries the error bubble; the strip
      // carries the flag.
      if (foreground) toast.error(`Run ended: ${payload.error.message}`);
      else useSessionTabStore.getState().setAttention(chat.sessionId, true);
    }
    notifyIfHidden(
      foreground
        ? `${useSessionStore.getState().projectName || 'Agent'} run failed`
        : `${tabLabel(chat.sessionId)} run failed`,
      payload.error.message,
      runTag(chat.sessionId),
    );
    if (typeof document !== 'undefined' && document.hidden && isForeground(chat)) {
      setFaviconStatus('error');
    }
  } else if (payload.status === 'done') {
    if (typeof document !== 'undefined' && document.hidden) {
      const foreground = isForeground(chat);
      // The toast is queued while the page is hidden and surfaces when the
      // user comes back — in whatever tab is in front by then, which is not
      // necessarily the one that finished.
      if (foreground) {
        toast.success(`Run completed in ${iterations} iteration${iterations === 1 ? '' : 's'}`);
      } else {
        useSessionTabStore.getState().setAttention(chat.sessionId, true);
      }
      notifyIfHidden(
        foreground
          ? `${useSessionStore.getState().projectName || 'Agent'} run finished`
          : `${tabLabel(chat.sessionId)} run finished`,
        `Completed in ${iterations} iteration${iterations === 1 ? '' : 's'}.`,
        runTag(chat.sessionId),
      );
      if (foreground) setFaviconStatus('ready');
    }
    void ensureNotificationPermission();
    if (useConfigStore.getState().soundOnComplete) {
      try {
        playCompletionChime();
      } catch {
        /* audio policy */
      }
    }
    // Signal NextStepsBar to start a timed auto-fill countdown that places
    // the first suggestion into the input without auto-submitting. The user
    // can still modify it or press Enter to send.
    if (typeof document !== 'undefined' && isForeground(chat)) {
      document.dispatchEvent(new CustomEvent('chat:next-step-countdown'));
    }
  }
  const store = chat;
  // ── Drain target selection ───────────────────────────────────────────
  // Peek at the front without popping. If the front is a BTW chip that
  // is already wire-sent (mid-way through its visible SENT grace window,
  // owned by `BTW_DISPATCH_GRACE_MS` / `dispatchedGraceTimers`), leave
  // it where it is — its visible lifecycle is owned by the grace timer,
  // not by `run.result`. Drain the first non-dispatched item.
  const front = store.queue[0];
  if (!front) return;
  if (front.alreadyDispatched === true) {
    // Add the user bubble for the dispatched chip so the transcript
    // stays complete — same intent as the pre-fix drain path. The
    // `bubbleAdded` flag gates idempotency: a second `run.result`
    // landing inside the grace window must NOT add a duplicate bubble.
    // The grace timer still owns the chip's removal from the queue.
    addBubbleFor(chat, front);
    const drained = store.dequeueDrainable();
    if (!drained) return;
    return runDrain(chat, drained);
  }
  // Front is a pending item — pop it and drain. Cancels any pending
  // grace timer for it (none should exist since `alreadyDispatched`
  // is false, but the cancel is idempotent and safe).
  const drained = store.dequeue();
  if (!drained) return;
  return runDrain(chat, drained);
}

/**
 * Add a user message bubble for the drained item. Idempotent per chip:
 * once added, the chip's `bubbleAdded` flag prevents subsequent
 * `run.result` events inside the grace window from emitting a duplicate
 * bubble for the same chat note. The pre-fix path popped the chip
 * exactly once, so the bubble was emitted exactly once; the new
 * path keeps the chip in the queue for its visible lifecycle, so
 * the gate is the only thing preserving the "one bubble per chip"
 * invariant.
 *
 * Mirrors the wire-encoding of a regular user_message so the
 * bubble's `attachments` carry the same image chips a typed send
 * would produce.
 */
function addBubbleFor(chat: ChatLaneActions, next: QueuedItem): void {
  if (next.bubbleAdded === true) return;
  const images = next.images ?? [];
  chat.addMessage({
    role: 'user',
    content: next.text,
    ...(images.length > 0
      ? {
          attachments: images.map((img) => ({
            id: img.id,
            kind: 'image' as const,
            dataUrl: img.dataUrl,
            mediaType: img.mediaType,
            bytes: img.bytes,
            name: img.name,
          })),
        }
      : {}),
  });
  // Stamp the flag in-place so the next `run.result` skips the second
  // emit. We mutate the next object directly (the queue array holds
  // the same reference) which is safe because the queue is rebuilt
  // by `dequeue`/`dequeueDrainable` before its members are read.
  next.bubbleAdded = true;
}

/**
 * Drain a single queued item into the chat + wire.
 *
 * - 'btw' mode: the note rides alongside the running agent via the
 *   mailbox and is injected into context on the next iteration. If it
 *   was already dispatched at submit time (immediate mid-run mailbox
 *   injection in ChatInput.submitWith), re-sending would fold the same
 *   note into the agent's context a second time — skip the mailbox
 *   branch but still add the user bubble so the transcript stays
 *   complete.
 * - 'queue' / 'steer' (default): sends as a regular user_message,
 *   starting a fresh run after the current one finishes.
 */
function runDrain(chat: ChatLaneActions, next: QueuedItem): void {
  const client = getWSClient(useConfigStore.getState().wsUrl);
  const images = next.images ?? [];
  chat.addMessage({
    role: 'user',
    content: next.text,
    ...(images.length > 0
      ? {
          attachments: images.map((img) => ({
            id: img.id,
            kind: 'image' as const,
            dataUrl: img.dataUrl,
            mediaType: img.mediaType,
            bytes: img.bytes,
            name: img.name,
          })),
        }
      : {}),
  });

  // ── Mode-aware dispatch ──────────────────────────────────────────────
  if (next.mode === 'btw') {
    if (next.alreadyDispatched !== true) {
      client.sendMailboxMessage(
        {
          type: 'btw',
          to: 'leader',
          subject: 'btw from WebUI',
          body: next.text,
          priority: 'normal',
          audience: 'all',
        },
        chat.sessionId,
      );
    }
    // Don't set loading — we're not starting a run, the mailbox
    // injection will fold into the existing run's next iteration.
    return;
  }

  chat.setLoading(true);
  // Address the send at the lane that owns the queue, NOT the tab in front:
  // a background run finishing drains ITS queue, and the default stamping
  // would have started that run in whichever session the user was looking at.
  client.sendMessage(
    next.text,
    images.length > 0 ? toWireImages(images) : undefined,
    false,
    chat.sessionId,
  );
}
