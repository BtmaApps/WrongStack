import { toast } from '@/components/Toaster';

import { i18n } from '@/i18n';

import { taskBriefPreview } from '@/lib/task-brief-preview';

import { readLane } from './chat-lanes';

import { useFleetStore } from './fleet-store';

import { readSessionLane } from './session-lanes';

/** A tab is "busy" when its own run is live or it owns a running subagent. */
export function isTabBusy(sessionId: string): boolean {
  if (readLane(sessionId).isLoading) return true;
  for (const agent of useFleetStore.getState().agents.values()) {
    if (agent.sessionId === sessionId && agent.status === 'running') return true;
  }
  return false;
}

/** Everything a busy-tab warning needs to say about one session, gathered in
 *  one place. The close dialog and the switch-away toast render the same
 *  `lines`, so the two warnings cannot drift apart or go vague. */
export interface SessionActivityReport {
  sessionId: string;
  isBusy: boolean;
  /** True when the tab holds nothing at all — no chat history, no agents
   *  (running or finished), no queued messages, no live run. Such a tab has
   *  nothing to lose and may close without asking. */
  isEmpty: boolean;
  leaderRunning: boolean;
  runningAgents: Array<{ id: string; name: string; brief: string }>;
  finishedAgents: number;
  queuedMessages: number;
  /** Pre-localized, factual inventory lines (no framing). */
  lines: string[];
}

/** Complete inventory of what a session has in flight: its own run, every
 *  running subagent with a task preview, finished agents on record, queued
 *  messages. Reads the lane registries directly, like `isTabBusy`. */
export function describeSessionActivity(sessionId: string): SessionActivityReport {
  const lane = readLane(sessionId);
  const leaderRunning = lane.isLoading;
  const runningAgents: SessionActivityReport['runningAgents'] = [];
  let finishedAgents = 0;
  for (const agent of useFleetStore.getState().agents.values()) {
    if (agent.sessionId !== sessionId) continue;
    if (agent.status === 'running') {
      runningAgents.push({
        id: agent.id,
        name: agent.name ?? agent.id,
        brief: agent.description ? taskBriefPreview(agent.description, 120) : '',
      });
    } else {
      finishedAgents += 1;
    }
  }
  const queuedMessages = lane.queue.length;
  const lines: string[] = [];
  if (leaderRunning) {
    lines.push(
      i18n.t('activity:sessions.warnLeaderRunning', { defaultValue: 'Leader run in progress' }),
    );
  }
  for (const agent of runningAgents) {
    lines.push(
      i18n.t('activity:sessions.warnSubagentLine', {
        defaultValue: '{{name}} — running{{suffix}}',
        name: agent.name,
        suffix: agent.brief ? `: ${agent.brief}` : '',
      }),
    );
  }
  if (finishedAgents > 0) {
    lines.push(
      i18n.t('activity:sessions.warnFinishedAgents', {
        defaultValue: '{{count}} finished subagent(s) on record',
        count: finishedAgents,
      }),
    );
  }
  if (queuedMessages > 0) {
    lines.push(
      i18n.t('activity:sessions.warnQueuedMessages', {
        defaultValue: '{{count}} queued message(s)',
        count: queuedMessages,
      }),
    );
  }
  // "Completely empty" means nothing on record and nothing in flight: closing
  // such a tab cannot lose work, so it needs no warning.
  const isEmpty =
    !leaderRunning &&
    runningAgents.length === 0 &&
    finishedAgents === 0 &&
    queuedMessages === 0 &&
    lane.messages.length === 0;
  return {
    sessionId,
    isBusy: leaderRunning || runningAgents.length > 0,
    isEmpty,
    leaderRunning,
    runningAgents,
    finishedAgents,
    queuedMessages,
    lines,
  };
}

/** Thorough, non-blocking notice fired when the foreground moves OFF a busy
 *  tab: the tab keeps running in its slot, and the user sees exactly what
 *  stays behind. Switching back is always one click, so this must inform,
 *  not block. */
export function notifyBusyTabLeftBehind(sessionId: string): void {
  if (!isTabBusy(sessionId)) return;
  const report = describeSessionActivity(sessionId);
  if (report.lines.length === 0) return;
  const title = readSessionLane(sessionId).session?.title ?? sessionId.slice(0, 8);
  toast.warn(
    i18n.t('activity:sessions.stillRunningToast', {
      defaultValue: '"{{title}}" keeps running in background:\n{{lines}}',
      title,
      lines: report.lines.join('\n'),
    }),
    7000,
  );
}
