/**
 * WebSocket message handler for SimpleUI.
 *
 * Extracted from app.tsx into a testable factory function.
 * The factory returns a stable handler reference so the
 * SimpleSocket effect never reconnects on a re-render.
 *
 * Usage in app.tsx:
 *   const handleServerMessage = useMemo(
 *     () => createMessageHandler({ ... }),
 *     [dispatchUserMessage, requestProviderModels, worklists],
 *   );
 */
import { parseArtifactPresentation } from '@wrongstack/tools/artifact-presentation';
import type { projectNextStepsToolInput } from '@wrongstack/tools/next-steps';
import { projectChatMessage, projectToolMessage } from '@wrongstack/webui-protocol';
import type { ServerMessage } from '../types.js';
import { dispatchPresentArtifact } from './artifact-presentation.js';
import { boundSimpleChatText, retainSimpleChatMessages } from './chat-model.js';
import { handleContextMessage } from './context-message-handler.js';
import {
  handleAgentStatusChangedMessage,
  handleAgentTimelineMessage,
  handleCoordinatorStatsMessage,
  handleDelegationNoticeMessage,
  handleFallbackPendingMessage,
  handleModelSwitchedMessage,
  handleProviderFallbackMessage,
  handleSubagentEventMessage,
} from './message-handler-agents.js';
import {
  handleFilesListMessage,
  handleModesListMessage,
  handleProviderCatalogMessage,
  handleProviderModelsMessage,
  handleProvidersSavedMessage,
  handleRefineResultMessage,
  handleResumeProgressMessage,
} from './message-handler-catalog.js';
import type { MessageHandlerDeps } from './message-handler-deps.js';
import { messageId } from './message-handler-notices.js';
import { handleSessionStartMessage } from './message-handler-session-start.js';
import {
  handleProviderResponseMessage,
  handleRunErrorMessage,
  handleThinkingDeltaMessage,
} from './message-handler-stream.js';
import {
  closeStaleToolCalls,
  handleToolExecuted,
  handleToolProgress,
  handleToolStarted,
} from './message-handler-tool-events.js';
import { projectAssistantMessage } from './message-projection.js';
import { parsePrefs } from './prefs-model.js';
import { dequeueItem } from './queue-model.js';
import { parseSessionSummaries } from './session-model.js';
import { projectStatusNotice } from './status-notice.js';

export { normalizeContextLoad } from './context-load.js';
export type { MessageHandlerDeps } from './message-handler-deps.js';
export { delegationNoticeText } from './message-handler-notices.js';

// ── Factory ─────────────────────────────────────────────────────────

export interface ServerMessageHandler {
  (message: ServerMessage): void;
  /**
   * Apply any buffered streaming text immediately.
   *
   * Deltas are coalesced onto an animation frame, so a caller that needs the
   * transcript to be current right now — a test asserting on state, or teardown
   * that would otherwise drop the last partial token — must drain the buffer
   * itself. Handling any non-delta message flushes implicitly.
   */
  flush(): void;
}

export function createMessageHandler(deps: MessageHandlerDeps): ServerMessageHandler {
  const {
    prefsRef,
    queueRef,
    sessionIdRef,
    setMessages,
    setRunning,
    setActivity,
    setToolCalls,
    setSessions,
    setPrefs,
    setNotice,
    setQueue,
    onChime,
    dispatchUserMessage,
    worklists,
  } = deps;

  /**
   * Drain the next queued message at a turn boundary (`run.result` / `error`).
   *
   * The queue head is only consumed if `dispatchUserMessage` actually sends
   * it. Previously the drain advanced the queue (`queueRef.current = rest;
   * setQueue(rest)`) BEFORE dispatching, so if dispatch was dropped — e.g. the
   * session was cleared between enqueue and drain — the held message was
   * removed from the queue but never sent: silent user-input loss. Gating on
   * the dispatch result keeps the item queued for the next successful drain.
   */
  function drainQueue(): void {
    const { item, rest } = dequeueItem(queueRef.current);
    if (!item) return;
    // Queued images replay on the same `user_message.images` payload the
    // direct send path uses; a text-only item keeps the single-argument call.
    const queuedImages = item.images?.length
      ? item.images.map((img) => ({ ...img, mediaType: img.mime }))
      : undefined;
    const dispatched = queuedImages
      ? dispatchUserMessage(item.text, queuedImages)
      : dispatchUserMessage(item.text);
    if (!dispatched) return; // dropped — keep the item queued
    queueRef.current = rest;
    setQueue(rest);
  }

  /**
   * Streaming text arrives one `provider.text_delta` frame per token. Applying
   * each one directly meant a `setMessages` — and therefore a React render of
   * the whole transcript — per token, with two full copies of the message array
   * allocated inside the updater. Deltas are instead accumulated here and
   * applied once per animation frame, matching the coalescing the WebUI chat
   * already does.
   *
   * Ordering is the constraint that makes this safe: every other message type
   * flushes the buffer before it is handled, so a tool call or run result can
   * never overtake text that arrived before it.
   */
  let pendingDelta = '';
  const nextStepsByToolId = new Map<string, ReturnType<typeof projectNextStepsToolInput>>();
  let completedToolNextSteps: ReturnType<typeof projectNextStepsToolInput> = [];
  let frameHandle: ReturnType<typeof setTimeout> | number | null = null;

  const scheduleFlush =
    typeof requestAnimationFrame === 'function'
      ? (callback: () => void) => requestAnimationFrame(callback)
      : (callback: () => void) => setTimeout(callback, 16);
  const cancelFlush =
    typeof cancelAnimationFrame === 'function'
      ? (handle: ReturnType<typeof setTimeout> | number) => cancelAnimationFrame(handle as number)
      : (handle: ReturnType<typeof setTimeout> | number) =>
          clearTimeout(handle as ReturnType<typeof setTimeout>);

  function flushPendingDelta(): void {
    if (frameHandle !== null) {
      cancelFlush(frameHandle);
      frameHandle = null;
    }
    if (!pendingDelta) return;
    const text = pendingDelta;
    pendingDelta = '';
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role === 'assistant' && last.streaming) {
        // Only the tail changes, so copy the array once and replace one entry
        // instead of mapping the whole transcript twice.
        const next = current.slice();
        next[next.length - 1] = { ...last, text: boundSimpleChatText(last.text + text) };
        return next;
      }
      // A thinking block is frozen the moment assistant text starts.
      const normalized = current.map((item) =>
        item.streaming && item.role === 'thinking' ? { ...item, streaming: false } : item,
      );
      normalized.push({
        id: messageId('assistant'),
        role: 'assistant',
        text: boundSimpleChatText(text),
        streaming: true,
        // Live entries need a real timestamp or the timeline orders them
        // against tool calls incorrectly (see ChatMessageList).
        ts: new Date().toISOString(),
      });
      return retainSimpleChatMessages(normalized);
    });
  }

  const handleServerMessage = function handleServerMessage(message: ServerMessage): void {
    // Anything that is not more streaming text must observe the text that
    // preceded it, so drain the buffer before doing any other work.
    if (message.type !== 'provider.text_delta') flushPendingDelta();
    const payload = message.payload ?? {};
    worklists.applyMessage(message);
    const projectedNotice = projectStatusNotice(message);
    if (projectedNotice) {
      setNotice({ ...projectedNotice, id: messageId('notice') });
    }
    switch (message.type) {
      case 'session.start': {
        handleSessionStartMessage({
          message,
          deps,
          nextStepsByToolId,
          resetCompletedToolNextSteps: () => {
            completedToolNextSteps = [];
          },
        });
        break;
      }
      case 'sessions.list': {
        if (typeof payload['error'] !== 'string') {
          setSessions(parseSessionSummaries(payload['sessions']));
        }
        break;
      }
      case 'session.resume_progress': {
        handleResumeProgressMessage(message, deps);
        break;
      }
      case 'provider.catalog': {
        handleProviderCatalogMessage(message, deps);
        break;
      }
      case 'providers.saved': {
        handleProvidersSavedMessage(message, deps);
        break;
      }
      case 'provider.models': {
        handleProviderModelsMessage(message, deps);
        break;
      }
      case 'files.list': {
        handleFilesListMessage(message, deps);
        break;
      }
      case 'provider.thinking_delta': {
        handleThinkingDeltaMessage(message, deps);
        break;
      }
      case 'provider.text_delta': {
        const projection = projectChatMessage(message);
        if (projection?.kind !== 'text-delta') break;
        const { text } = projection;
        setRunning(true);
        setActivity('Responding');
        pendingDelta += text;
        if (frameHandle === null) {
          frameHandle = scheduleFlush(() => {
            frameHandle = null;
            flushPendingDelta();
          });
        }
        break;
      }
      case 'provider.response': {
        handleProviderResponseMessage(message, deps);
        break;
      }
      case 'provider.retry':
        // The retry re-streams the whole reply: drop what the failed attempt
        // had already streamed (any pending delta was flushed above) so the
        // new stream does not append to it.
        setMessages((current) =>
          current.some((item) => item.streaming)
            ? current.filter((item) => !item.streaming)
            : current,
        );
        setRunning(true);
        setActivity(
          `Retrying ${typeof payload['providerId'] === 'string' ? payload['providerId'] : 'provider'}`,
        );
        break;
      case 'provider.fallback': {
        handleProviderFallbackMessage(message, deps);
        break;
      }
      case 'provider.model_switched': {
        handleModelSwitchedMessage(message, deps);
        break;
      }
      case 'provider.fallback_pending': {
        handleFallbackPendingMessage(message, deps);
        break;
      }
      case 'stats.get':
        handleContextMessage(message, deps);
        break;

      case 'context.compacted':
        setActivity('Context compacted');
        break;
      case 'tool.loop_detected':
        setActivity('Stopping repeated tool loop');
        break;
      case 'delegate.started':
      case 'delegate.completed': {
        if (
          typeof payload['sessionId'] === 'string' &&
          payload['sessionId'] !== sessionIdRef.current
        ) {
          break;
        }
        setActivity(message.type === 'delegate.started' ? 'Delegating' : 'Working');
        break;
      }
      case 'delegation.delivery_pending':
      case 'delegation.auto_wake_started':
      case 'delegation.auto_wake_suppressed': {
        handleDelegationNoticeMessage(message, deps);
        break;
      }
      case 'iteration.started':
        setRunning(true);
        setActivity('Thinking');
        break;
      case 'tool.started': {
        handleToolStarted(message, nextStepsByToolId, setRunning, setActivity, setToolCalls);
        break;
      }
      case 'tool.progress': {
        handleToolProgress(message, setActivity);
        break;
      }
      case 'tool.executed': {
        const tool = projectToolMessage(message);
        if (
          tool?.kind === 'executed' &&
          tool.name === 'present_artifact' &&
          tool.ok &&
          payload['sessionId'] === sessionIdRef.current
        ) {
          const artifact = parseArtifactPresentation(tool.output);
          if (artifact && artifact.sessionId === sessionIdRef.current)
            dispatchPresentArtifact(artifact);
        }
        handleToolExecuted(
          message,
          nextStepsByToolId,
          (steps) => {
            completedToolNextSteps = steps;
          },
          setActivity,
          setToolCalls,
        );
        break;
      }
      case 'run.result': {
        setRunning(false);
        setActivity('');
        if (prefsRef.current.chime) onChime?.();
        // The run is over. Anything still streaming is the turn's final
        // answer — provider.response normally marks it, but a run that ended
        // without one (abort, error, missing event) would otherwise leave the
        // last message unmarked and silently lose its suggestions.
        setMessages((current) =>
          current.map((item) =>
            item.streaming
              ? { ...item, streaming: false, ...(item.role === 'assistant' ? { final: true } : {}) }
              : item,
          ),
        );
        // The normal path carries the tool's steps in the final response as a
        // <nextsteps> block. If that response was absent, retain the exact
        // structured suggestions instead of silently losing the tool result.
        if (completedToolNextSteps.length > 0) {
          // The updater below runs when React renders, after this handler has
          // reset the shared variable: capture the steps by value.
          const pendingSteps = completedToolNextSteps;
          setMessages((current) => {
            // Only THIS turn's reply can already carry the steps. Scanning the
            // whole transcript let the first turn that ever rendered chips
            // suppress the tool-provided steps of every later turn.
            let turnStart = 0;
            for (let index = current.length - 1; index >= 0; index -= 1) {
              if (current[index]?.role === 'user') {
                turnStart = index + 1;
                break;
              }
            }
            const hasRenderedSuggestions = current
              .slice(turnStart)
              .some(
                (item) =>
                  item.role === 'assistant' &&
                  item.final === true &&
                  ((item.nextSteps?.length ?? 0) > 0 ||
                    projectAssistantMessage(item.text).nextSteps.length > 0),
              );
            return hasRenderedSuggestions
              ? current
              : retainSimpleChatMessages([
                  ...current,
                  {
                    id: messageId('nextsteps'),
                    role: 'assistant',
                    text: '',
                    final: true,
                    nextSteps: pendingSteps,
                    ts: new Date().toISOString(),
                  },
                ]);
          });
          completedToolNextSteps = [];
        }
        // The run is over: any tool still marked running lost its executed
        // frame (abort, dropped connection) and must not linger forever.
        closeStaleToolCalls(setToolCalls);
        drainQueue();
        break;
      }
      case 'prefs.updated':
        setPrefs((current) => parsePrefs(payload, current));
        break;
      case 'modes.list': {
        handleModesListMessage(message, deps);
        break;
      }
      case 'model.refine_result': {
        handleRefineResultMessage(message, deps);
        break;
      }
      case 'error': {
        handleRunErrorMessage(message, deps, drainQueue);
        break;
      }
      case 'ctx.pct':
      case 'ctx.max_context':
      case 'tool.confirm_needed':
      case 'tool.confirm_resolved':
      case 'user.input_requested':
      case 'user.input_resolved':
        handleContextMessage(message, deps);
        break;

      case 'coordinator.stats': {
        handleCoordinatorStatsMessage(message, deps);
        break;
      }
      case 'subagent.event': {
        handleSubagentEventMessage(message, deps);
        break;
      }
      case 'agent.timeline.message': {
        handleAgentTimelineMessage(message, deps);
        break;
      }
      case 'agent.status_changed': {
        handleAgentStatusChangedMessage(message, deps);
        break;
      }
    }
  } as ServerMessageHandler;

  handleServerMessage.flush = flushPendingDelta;
  return handleServerMessage;
}
