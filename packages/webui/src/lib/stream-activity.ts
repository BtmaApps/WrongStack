import { reduceStreamActivity, type StreamActivity } from '@wrongstack/webui-protocol';
import { chatFor } from '@/lib/ws-client-utils';
import { onLaneDisposed } from '@/stores/chat-lanes';
import type { WSServerMessage } from '@/types';

// Receive every chunk without broadcasting a store update for every token.
const activity = new Map<string, StreamActivity>();
onLaneDisposed((id) => activity.delete(id));
export const readStreamActivity = (id: string): StreamActivity | null => activity.get(id) ?? null;

export function observeStreamActivity(msg: WSServerMessage): void {
  if (
    ![
      'session.start',
      'session.run_state',
      'iteration.started',
      'provider.text_delta',
      'provider.thinking_delta',
      'provider.output_progress',
      'provider.response',
      'tool.started',
      'tool.executed',
      'run.result',
      'error',
    ].includes(msg.type)
  )
    return;
  const lane = chatFor(msg);
  if (!lane) return;
  const next = reduceStreamActivity(activity.get(lane.sessionId) ?? null, msg);
  if (next) activity.set(lane.sessionId, next);
  else activity.delete(lane.sessionId);
}
