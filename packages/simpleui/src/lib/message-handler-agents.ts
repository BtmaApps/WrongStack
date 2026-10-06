import { projectFleetMessage } from '@wrongstack/webui-protocol';
import { projectFallbackPending } from '../fallback-modal.js';
import type { ServerMessage, SimpleSubagent } from '../types.js';
import {
  appendAgentTranscriptEntry,
  LEADER_AGENT_ID,
  mergeSubagentSnapshot,
  projectAgentTimelineEntry,
  projectCompletedAgentText,
  stampAgentUpdates,
} from './agent-model.js';
import { boundSimpleChatText, retainSimpleChatMessages, updateSubagents } from './chat-model.js';
import type { MessageHandlerDeps } from './message-handler-deps.js';
import { delegationNoticeText, messageId } from './message-handler-notices.js';

/*
 * Provider-fallback, delegation, and subagent/fleet message handlers for
 * `createMessageHandler`. Session-scoped events are ignored for other tabs.
 */

/** `provider.fallback` — a fallback model took over (this tab's session only). */
export function handleProviderFallbackMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { sessionIdRef, setRunning, setActivity } = deps;
  const payload = message.payload ?? {};
  // The server broadcasts fallback events to every connected client.
  // Only react to the session this tab is viewing — otherwise one
  // session's resolution would clear another tab's pending modal.
  if (typeof payload['sessionId'] === 'string' && payload['sessionId'] !== sessionIdRef.current) {
    return;
  }
  const target =
    payload['to'] && typeof payload['to'] === 'object'
      ? (payload['to'] as Record<string, unknown>)
      : undefined;
  const fallbackModel = typeof target?.['model'] === 'string' ? target['model'] : '';
  setRunning(true);
  setActivity(fallbackModel ? `Fallback · ${fallbackModel}` : 'Switching fallback model');
  // Clear any pending fallback modal — the switch happened.
  deps.setFallbackPending?.(null);
  return;
}

/** `provider.model_switched` — activity line for a model switch (this tab's session only). */
export function handleModelSwitchedMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { sessionIdRef, setActivity } = deps;
  const payload = message.payload ?? {};
  if (typeof payload['sessionId'] === 'string' && payload['sessionId'] !== sessionIdRef.current) {
    return;
  }
  const target =
    payload['to'] && typeof payload['to'] === 'object'
      ? (payload['to'] as Record<string, unknown>)
      : undefined;
  const model = typeof target?.['model'] === 'string' ? target['model'] : '';
  setActivity(model ? `Model · ${model}` : 'Model switched');
  return;
}

/** `provider.fallback_pending` — show the fallback modal (this tab's session only). */
export function handleFallbackPendingMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { sessionIdRef } = deps;
  const payload = message.payload ?? {};
  // Server broadcasts reach every tab; only show the modal for the
  // session this tab is viewing.
  if (typeof payload['sessionId'] === 'string' && payload['sessionId'] !== sessionIdRef.current) {
    return;
  }
  // Show the fallback modal with countdown + manual pick.
  const projected = projectFallbackPending(message);
  if (projected) {
    deps.setFallbackPending?.(projected);
  }
  return;
}

/** `delegation.*` — delivery / auto-wake runtime notices. */
export function handleDelegationNoticeMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { sessionIdRef, setMessages } = deps;
  const payload = message.payload ?? {};
  if (typeof payload['sessionId'] === 'string' && payload['sessionId'] !== sessionIdRef.current) {
    return;
  }
  const text = delegationNoticeText(message.type, payload);
  if (!text) return;
  // A runtime line, never a user bubble: a woken turn is not something
  // the user typed. The queue stays user-only — nothing here drains it.
  setMessages((current) =>
    retainSimpleChatMessages([
      ...current,
      {
        id: messageId('delegation'),
        role: 'system',
        text: boundSimpleChatText(text),
        ts: new Date().toISOString(),
      },
    ]),
  );
  return;
}

/** `coordinator.stats` — merge the coordinator's subagent snapshot. */
export function handleCoordinatorStatsMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { setSubagents } = deps;
  const fleet = projectFleetMessage(message);
  const statuses = fleet?.kind === 'coordinator' ? fleet.agents : [];
  const snapshot = statuses.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const id = typeof item['id'] === 'string' ? item['id'] : '';
    if (!id || id === LEADER_AGENT_ID) return [];
    return [
      {
        id,
        name: typeof item['name'] === 'string' ? item['name'] : id,
        status: typeof item['status'] === 'string' ? item['status'] : 'idle',
        task: typeof item['currentTask'] === 'string' ? item['currentTask'] : undefined,
      } satisfies SimpleSubagent,
    ];
  });
  setSubagents((current) => stampAgentUpdates(current, mergeSubagentSnapshot(current, snapshot)));
  return;
}

/** `subagent.event` — subagent lifecycle + completed-task transcript entry. */
export function handleSubagentEventMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { setSubagents, setAgentTranscripts } = deps;
  const payload = message.payload ?? {};
  const id = typeof payload['subagentId'] === 'string' ? payload['subagentId'] : '';
  setSubagents((current) =>
    stampAgentUpdates(
      current,
      payload['kind'] === 'removed'
        ? current.map((agent) =>
            agent.id === id ? { ...agent, status: 'stopped', task: undefined } : agent,
          )
        : updateSubagents(current, payload),
    ),
  );
  if (payload['kind'] === 'task_completed' && id) {
    const entry = projectCompletedAgentText(
      payload,
      messageId(`agent-${id}`),
      typeof payload['name'] === 'string' ? payload['name'] : id,
    );
    if (entry) {
      setAgentTranscripts((current) => ({
        ...current,
        [id]: appendAgentTranscriptEntry(current[id] ?? [], entry),
      }));
    }
  }
  return;
}

/** `agent.timeline.message` — append a live agent transcript entry. */
export function handleAgentTimelineMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  const { setSubagents, setAgentTranscripts } = deps;
  const payload = message.payload ?? {};
  const entry = projectAgentTimelineEntry(payload, messageId('agent-event'));
  if (!entry) return;
  setSubagents((current) => {
    if (current.some((agent) => agent.id === entry.subagentId)) return current;
    return [
      ...current,
      {
        id: entry.subagentId,
        name: entry.agentName,
        status: 'running',
      },
    ];
  });
  setAgentTranscripts((current) => ({
    ...current,
    [entry.subagentId]: appendAgentTranscriptEntry(current[entry.subagentId] ?? [], entry),
  }));
  return;
}

/** `agent.status_changed` — upsert one subagent's status/task. */
export function handleAgentStatusChangedMessage(
  message: ServerMessage,
  deps: MessageHandlerDeps,
): void {
  const { setSubagents } = deps;
  const payload = message.payload ?? {};
  const id = typeof payload['subagentId'] === 'string' ? payload['subagentId'] : '';
  if (!id || id === LEADER_AGENT_ID) return;
  const agentName = typeof payload['agentName'] === 'string' ? payload['agentName'] : id;
  setSubagents((current) => {
    const exists = current.some((agent) => agent.id === id);
    const patch = {
      id,
      name: agentName,
      status: typeof payload['status'] === 'string' ? payload['status'] : 'idle',
      task: typeof payload['task'] === 'string' ? payload['task'] : undefined,
    } satisfies SimpleSubagent;
    return exists
      ? current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent))
      : [...current, patch];
  });
  return;
}
