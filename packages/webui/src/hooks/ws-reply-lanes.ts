import { chatFor, sessionFor } from '@/lib/ws-client-utils';
import { activeChatLane, type ChatLaneActions } from '@/stores/chat-lanes';
import { activeSessionLane, type SessionLaneActions } from '@/stores/session-lanes';
import type { WSServerMessage } from '@/types';

/** Command replies address the requesting tab, with a foreground fallback for untagged replies. */
export function replyLane(msg: WSServerMessage): ChatLaneActions {
  return chatFor(msg) ?? activeChatLane();
}

/** Session-accounting twin of the chat reply router. */
export function replyMeta(msg: WSServerMessage): SessionLaneActions {
  return sessionFor(msg) ?? activeSessionLane();
}
