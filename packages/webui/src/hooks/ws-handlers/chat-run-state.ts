import type { projectNextStepsToolInput } from '@wrongstack/tools/next-steps';
import { streamCoalescer } from '@/lib/stream-coalescer';
import { useUIStore } from '@/stores';
import { activeLaneId, type ChatLaneActions, onLaneDisposed } from '@/stores/chat-lanes';

export type NextSteps = ReturnType<typeof projectNextStepsToolInput>;

/**
 * Per-lane run bookkeeping. These used to be two module-level globals, which
 * meant tab 2's `nextsteps` tool output became tab 1's suggestion chips the
 * moment both were running. Everything scoped to a run is now keyed by the
 * session that owns the run.
 */
export const nextStepsByToolId = new Map<string, Map<string, NextSteps>>();
export const completedToolNextSteps = new Map<string, NextSteps>();

export function laneNextSteps(sessionId: string): Map<string, NextSteps> {
  let map = nextStepsByToolId.get(sessionId);
  if (!map) {
    map = new Map();
    nextStepsByToolId.set(sessionId, map);
  }
  return map;
}

/** Coalescer key for a lane's thinking buffer. Shared keys merged two tabs'
 *  reasoning into one stream, so the key carries the session. */
export function thinkingKey(sessionId: string): string {
  return `__thinking__:${sessionId}`;
}

/**
 * True when this lane is the one on screen. DOM-level side effects (the
 * composer's next-step countdown, the favicon) belong to the foreground only:
 * a background run finishing must not reach into the tab the user is typing in.
 */
export function isForeground(chat: ChatLaneActions): boolean {
  return chat.sessionId === activeLaneId();
}

/**
 * How a tab is named in a desktop notification.
 *
 * A run that ends in a background tab is still worth telling the user about —
 * they may be in another app entirely — but a bare "run finished" over four
 * open conversations is a riddle. The nickname is what the tab strip shows, so
 * it is the label the user can actually match against.
 */
export function tabLabel(sessionId: string): string {
  const nickname = useUIStore.getState().sessionNicknames[sessionId];
  return nickname ?? `session ${sessionId.slice(0, 8)}`;
}

/**
 * Run notifications are tagged PER SESSION.
 *
 * `notifyIfHidden` collapses same-tag notifications so a single run cannot
 * litter the notification centre — but with four tabs on one page that same
 * collapse silently swallowed three of four completions, and the one that
 * survived was whichever landed last. One tag per session keeps the collapse
 * within a conversation, which is what it was for.
 */
export function runTag(sessionId: string): string {
  return `wrongstack-run:${sessionId}`;
}

/** Forget a retired lane's run bookkeeping. */
export function forgetLaneRunState(sessionId: string): void {
  nextStepsByToolId.delete(sessionId);
  completedToolNextSteps.delete(sessionId);
  streamCoalescer.drop(thinkingKey(sessionId));
}

// Closing a tab disposes its lane; these maps have to go with it. Exported and
// never called, they leaked a retired session's pending next-steps and its
// thinking buffer for the life of the page — and would have resurfaced them if
// the id were ever reused.
onLaneDisposed(forgetLaneRunState);
