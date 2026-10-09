import { isFinalTurnStopReason } from '@wrongstack/tools/next-steps';
import { projectChatMessage } from '@wrongstack/webui-protocol';
import type { ServerMessage } from '../types.js';
import { boundSimpleChatText, contentToText, retainSimpleChatMessages } from './chat-model.js';
import type { MessageHandlerDeps } from './message-handler-deps.js';
import { messageId } from './message-handler-notices.js';
import { closeStaleToolCalls } from './message-handler-tool-events.js';

/* Streaming thinking / final-response and run-error handlers for `createMessageHandler`. */

/** `provider.thinking_delta` — grow (or open) the streaming thinking block. */
export function handleThinkingDeltaMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { setMessages, setRunning, setActivity } = deps;
  const projection = projectChatMessage(message);
  if (projection?.kind !== 'thinking-delta') return;
  const { text } = projection;
  setRunning(true);
  setActivity('Thinking');
  setMessages((current) => {
    const last = current.at(-1);
    if (last?.role === 'thinking' && last.streaming) {
      return current.map((item, index) =>
        index === current.length - 1
          ? { ...item, text: boundSimpleChatText(item.text + text) }
          : item,
      );
    }
    return retainSimpleChatMessages([
      ...current.map((item) =>
        item.streaming && item.role === 'thinking' ? { ...item, streaming: false } : item,
      ),
      {
        id: messageId('thinking'),
        role: 'thinking',
        text: boundSimpleChatText(text),
        streaming: true,
        ts: new Date().toISOString(),
      },
    ]);
  });
  return;
}

/** `provider.response` — settle the streamed assistant turn with the canonical text. */
export function handleProviderResponseMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { setMessages, setActivity } = deps;
  const projection = projectChatMessage(message);
  if (projection?.kind !== 'response') return;
  const responseText = contentToText(projection.content).trim();
  // A `tool_use` stop means the agent loop runs again, so this text is
  // prose the model wrote on its way to a tool call — not its answer.
  // Only a turn-ending response may offer <nextsteps> suggestions.
  const final = isFinalTurnStopReason(projection.stopReason);
  setMessages((current) => {
    const last = current.at(-1);
    if (last?.role === 'assistant' && last.streaming) {
      // The canonical response can legitimately extend what was streamed:
      // the runtime appends a tool-produced <nextsteps> block to the
      // turn-ending response, and that block never arrives as a delta.
      // Adopt the canonical text when it is a strict extension of the
      // streamed text — same rule the WebUI applies (protocol parity).
      const streamedText = last.text.trim();
      const extended =
        streamedText.length > 0 &&
        responseText.length > streamedText.length &&
        responseText.startsWith(streamedText);
      return current.map((item, index) =>
        index === current.length - 1
          ? {
              ...item,
              ...(extended ? { text: boundSimpleChatText(responseText) } : {}),
              streaming: false,
              final,
            }
          : item,
      );
    }
    return responseText
      ? retainSimpleChatMessages([
          ...current,
          {
            id: messageId('assistant'),
            role: 'assistant',
            text: boundSimpleChatText(responseText),
            final,
            ts: new Date().toISOString(),
          },
        ])
      : current;
  });
  setActivity('Working');
  return;
}

/** `error` — end the run with a system line (or a transient rate-limit notice). */
export function handleRunErrorMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
  drainQueue: () => void,
): void {
  const { setMessages, setRunning, setActivity, setToolCalls, setNotice } = deps;
  const payload = message.payload ?? {};
  const phase = typeof payload['phase'] === 'string' ? payload['phase'] : '';
  if (phase === 'session.resume' || phase === 'session.focus') {
    deps.setResumeProgress?.(null);
  }
  if (phase === 'rate_limit') {
    // Rate-limit frames are transient throttles, not run failures.
    // Show as a dismissible notice (not a permanent chat message) and
    // do NOT drain the queue — dispatching now would just feed more
    // messages into the throttled connection, re-triggering the
    // limiter and flooding the chat with "SYSTEM Too many messages."
    //
    // Clear the running spinner: the server dropped the frame that
    // triggered the limiter, so no run.result/error will ever arrive
    // to clear it. Without this the UI stays stuck on "Thinking".
    setRunning(false);
    setActivity('');
    setNotice({
      id: messageId('rate-limit'),
      text:
        typeof payload['message'] === 'string'
          ? payload['message']
          : 'Too many messages. Please wait.',
      tone: 'warning',
    });
    return;
  }
  const text = typeof payload['message'] === 'string' ? payload['message'] : 'Run failed';
  setRunning(false);
  setActivity('');
  setMessages((current) =>
    retainSimpleChatMessages([
      // The error ends the run, so whatever was still streaming is settled
      // (not `final`: no suggestions) exactly as run.result would settle it.
      ...current.map((item) => (item.streaming ? { ...item, streaming: false } : item)),
      {
        id: messageId('error'),
        role: 'system',
        text: boundSimpleChatText(text),
        ts: new Date().toISOString(),
      },
    ]),
  );
  closeStaleToolCalls(setToolCalls);
  drainQueue();
  return;
}
