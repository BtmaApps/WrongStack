import { openMainView, showPanel } from '@/lib/view-navigation';
import { useGoalRunStore, useUIStore } from '@/stores';
import { useGoalCatalogStore } from '@/stores/goal-catalog-store';
import type { ChatAssistantMessage, SlashRoutingClient } from './slash-routing-types.js';

/**
 * `/goal` — mission set/status (goal-state) plus phase-run
 * start/pause/resume/stop/list/load/save against the Goal catalog.
 */
export function runGoalSlashCommand(
  args: string,
  client: SlashRoutingClient | null | undefined,
  addMessage: (message: ChatAssistantMessage) => void,
): boolean {
  const [sub, ...rest] = args.split(/\s+/).filter(Boolean);
  const subcmd = (sub ?? '').toLowerCase();
  if (subcmd === 'start') {
    const title = rest.join(' ').trim();
    if (!title) {
      addMessage({ role: 'assistant', content: 'Usage: `/goal start <title>`' });
      return true;
    }
    const goalId = crypto.randomUUID();
    useGoalCatalogStore.getState().selectGoal(goalId);
    useGoalRunStore.getState().clear();
    client?.send?.({
      type: 'goal.start',
      payload: client.withSession?.({ title, goalId }) ?? { title, goalId },
    });
    openMainView('goal');
    return true;
  }
  if (subcmd === 'set' || subcmd === 'new') {
    const goal = rest.join(' ').trim();
    if (!goal) {
      addMessage({ role: 'assistant', content: 'Usage: `/goal set <mission>`' });
      return true;
    }
    client?.send?.({
      type: 'goal-state.set',
      payload: client.withSession?.({ goal }) ?? { goal },
    });
    useUIStore.getState().setDockSection('goal-state');
    showPanel('chat');
    return true;
  }
  if (subcmd === 'clear') {
    client?.send?.({ type: 'goal-state.clear', payload: {} });
    return true;
  }
  if (subcmd === 'save') {
    client?.send?.({
      type: 'goal.save',
      payload: { goalId: useGoalCatalogStore.getState().selectedGoalId ?? undefined },
    });
    return true;
  }
  if (subcmd === 'list') {
    client?.send?.({ type: 'goal.list', payload: {} });
    openMainView('goal');
    return true;
  }
  if (subcmd === 'load') {
    const resume = rest.includes('--resume');
    const query = rest
      .filter((part) => part !== '--resume')
      .join(' ')
      .trim();
    client?.send?.({ type: 'goal.load', payload: { query, resume } });
    openMainView('goal');
    return true;
  }
  if (subcmd === 'refine') {
    client?.send?.({
      type: 'goal-state.refine',
      payload: client.withSession?.({}) ?? {},
    });
    useUIStore.getState().setDockSection('goal-state');
    showPanel('chat');
    return true;
  }
  if (subcmd === 'status' && rest.length > 0) {
    const goalId = rest.join(' ').trim();
    useGoalCatalogStore.getState().selectGoal(goalId);
    useGoalRunStore.getState().clear();
    client?.send?.({ type: 'goal.status', payload: { goalId } });
    openMainView('goal');
    return true;
  }
  if (subcmd === 'status' && useGoalCatalogStore.getState().selectedGoalId) {
    client?.send?.({
      type: 'goal.status',
      payload: { goalId: useGoalCatalogStore.getState().selectedGoalId! },
    });
    openMainView('goal');
    return true;
  }
  if (subcmd === 'status' || subcmd === 'journal') {
    client?.send?.({ type: 'goal-state.get' });
    useUIStore.getState().setDockSection('goal-state');
    showPanel('chat');
    return true;
  }
  if (subcmd === 'pause') {
    const runStatus = useGoalRunStore.getState().status;
    client?.send?.(
      runStatus === 'running'
        ? {
            type: 'goal.pause',
            payload: { goalId: useGoalCatalogStore.getState().selectedGoalId ?? undefined },
          }
        : { type: 'goal-state.pause', payload: {} },
    );
    return true;
  }
  if (subcmd === 'resume') {
    const { status: runStatus, graphId: savedGraphId } = useGoalRunStore.getState();
    client?.send?.(
      runStatus === 'paused'
        ? {
            type: 'goal.resume',
            payload: { goalId: useGoalCatalogStore.getState().selectedGoalId ?? undefined },
          }
        : (runStatus === 'stopped' || runStatus === 'failed') && savedGraphId
          ? { type: 'goal.resume', payload: { graphId: savedGraphId, goalId: savedGraphId } }
          : { type: 'goal-state.resume', payload: {} },
    );
    return true;
  }
  if (subcmd === 'stop') {
    client?.send?.({
      type: 'goal.stop',
      payload: { goalId: useGoalCatalogStore.getState().selectedGoalId ?? undefined },
    });
    return true;
  }
  if (subcmd) {
    client?.send?.({
      type: 'goal-state.set',
      payload: client.withSession?.({ goal: args.trim() }) ?? { goal: args.trim() },
    });
    useUIStore.getState().setDockSection('goal-state');
    showPanel('chat');
    return true;
  }
  openMainView('goal');
  return true;
}
