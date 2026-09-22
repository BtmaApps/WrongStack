import type { PhaseItem } from '@/components/PhasePanel';
import { toast } from '@/components/Toaster';
import { useGoalRunStore, useGoalStateStore } from '@/stores';
import type { WSServerMessage } from '@/types';

function deriveGoalRunStatus(
  phases: PhaseItem[] | undefined,
): 'running' | 'paused' | 'completed' | 'failed' | undefined {
  if (!phases || phases.length === 0) return undefined;
  const statuses = phases.map((p) => (p as unknown as { status?: string }).status);
  if (statuses.some((s) => s === 'failed')) return 'failed';
  if (statuses.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  if (statuses.some((s) => s === 'paused')) return 'paused';
  return 'running';
}

function parseGoalProgress(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const p = value as Record<string, unknown>;
  const keys = [
    'totalPhases',
    'completed',
    'failed',
    'totalTasks',
    'completedTasks',
    'failedTasks',
  ] as const;
  if (keys.some((key) => typeof p[key] !== 'number' || !Number.isFinite(p[key]))) {
    return undefined;
  }
  return {
    totalPhases: p.totalPhases as number,
    completed: p.completed as number,
    failed: p.failed as number,
    totalTasks: p.totalTasks as number,
    completedTasks: p.completedTasks as number,
    failedTasks: p.failedTasks as number,
  };
}

export function handleGoalState(msg: WSServerMessage) {
  const p = msg.payload as Record<string, unknown>;
  const phases = Array.isArray(p.phases) ? (p.phases as PhaseItem[]) : undefined;
  const explicitStatus =
    typeof p.status === 'string' &&
    ['idle', 'running', 'paused', 'completed', 'failed', 'stopped'].includes(p.status)
      ? (p.status as ReturnType<typeof useGoalRunStore.getState>['status'])
      : undefined;
  const status = explicitStatus ?? deriveGoalRunStatus(phases);
  const progress = parseGoalProgress(p.progress);
  const serverError = typeof p.lastError === 'string' ? p.lastError : null;
  const finalVerification =
    p.finalVerification &&
    typeof p.finalVerification === 'object' &&
    !Array.isArray(p.finalVerification) &&
    ((p.finalVerification as Record<string, unknown>).status === 'passed' ||
      (p.finalVerification as Record<string, unknown>).status === 'failed') &&
    typeof (p.finalVerification as Record<string, unknown>).checkedAt === 'number'
      ? (p.finalVerification as NonNullable<
          ReturnType<typeof useGoalRunStore.getState>['finalVerification']
        >)
      : p.finalVerification === null
        ? null
        : undefined;
  useGoalRunStore.getState().setState({
    phases,
    activePhaseId: typeof p.activePhaseId === 'string' ? p.activePhaseId : undefined,
    overallPercent: typeof p.overallPercent === 'number' ? p.overallPercent : undefined,
    autonomous: typeof p.autonomous === 'boolean' ? p.autonomous : undefined,
    title: typeof p.title === 'string' ? p.title : undefined,
    graphId: typeof p.graphId === 'string' ? p.graphId : p.graphId === null ? null : undefined,
    goal: typeof p.goal === 'string' ? p.goal : undefined,
    status,
    multiBoard: p.multiBoard === true,
    progress,
    finalVerification,
    lastError: status === 'failed' ? serverError : null,
  });
}

export function handleGoalProgress(msg: WSServerMessage) {
  const p = msg.payload as Record<string, unknown>;
  const progress = {
    totalPhases: typeof p.totalPhases === 'number' ? p.totalPhases : 0,
    completed: typeof p.completed === 'number' ? p.completed : 0,
    failed: typeof p.failed === 'number' ? p.failed : 0,
    totalTasks: typeof p.totalTasks === 'number' ? p.totalTasks : 0,
    completedTasks: typeof p.completedTasks === 'number' ? p.completedTasks : 0,
    failedTasks: typeof p.failedTasks === 'number' ? p.failedTasks : 0,
  };
  useGoalRunStore.getState().setState({
    progress,
    overallPercent:
      typeof p.percentComplete === 'number' ? Math.round(p.percentComplete) : undefined,
    status: progress.failed > 0 || progress.failedTasks > 0 ? 'failed' : 'running',
    lastEvent: 'progress',
  });
}

export function handleGoalLifecycle(msg: WSServerMessage) {
  const p = msg.payload as Record<string, unknown>;
  const title = typeof p.title === 'string' && p.title ? p.title : 'Goal';
  const error = typeof p.error === 'string' && p.error ? p.error : undefined;

  if (msg.type === 'goal.paused') {
    useGoalRunStore
      .getState()
      .setState({ status: 'paused', autonomous: false, lastEvent: 'paused' });
    toast.info('Goal paused');
    return;
  }
  if (msg.type === 'goal.resumed') {
    useGoalRunStore
      .getState()
      .setState({ status: 'running', autonomous: true, lastEvent: 'resumed' });
    toast.info('Goal resumed');
    return;
  }
  if (msg.type === 'goal.stopped') {
    useGoalRunStore
      .getState()
      .setState({ status: 'stopped', autonomous: false, lastEvent: 'stopped' });
    toast.warn('Goal stopped');
    return;
  }
  if (msg.type === 'goal.cleared') {
    // Reset to an empty board → the view falls back to the goal-entry screen.
    useGoalRunStore.getState().clear();
    return;
  }
  if (msg.type === 'goal.reverted') {
    const ok = (p as { ok?: boolean }).ok === true;
    const reverted = typeof p.reverted === 'number' ? p.reverted : 0;
    const reason = typeof p.reason === 'string' ? p.reason : undefined;
    if (ok) {
      toast.success(
        reverted > 0
          ? `Reverted ${reverted} commit${reverted === 1 ? '' : 's'}`
          : 'Nothing to revert',
      );
    } else {
      toast.error(`Revert failed: ${reason ?? 'unknown error'}`);
    }
    useGoalRunStore.getState().setState({ lastEvent: 'reverted' });
    return;
  }
  if (msg.type === 'goal.saved') {
    useGoalRunStore.getState().setState({ lastEvent: 'saved' });
    toast.success('Goal graph saved');
    return;
  }
  if (msg.type === 'goal.completed') {
    useGoalRunStore.getState().setState({
      status: 'completed',
      autonomous: false,
      overallPercent: 100,
      lastEvent: 'completed',
      lastError: null,
    });
    toast.success(`${title} completed`);
    return;
  }
  if (msg.type === 'goal.failed' || msg.type === 'goal.error') {
    const message = error ?? (typeof p.message === 'string' ? p.message : `${title} failed`);
    useGoalRunStore
      .getState()
      .setState({ status: 'failed', autonomous: false, lastEvent: 'failed', lastError: message });
    toast.error(message);
  }
}

export function handleGoalList(msg: WSServerMessage) {
  const p = msg.payload as {
    graphs?: Array<{ id: string; title: string; updatedAt: number; status: string }> | undefined;
  };
  useGoalRunStore.getState().setState({
    lastEvent: 'list',
    graphs: Array.isArray(p.graphs) ? p.graphs : [],
  });
}

export function handleGoalUpdated(msg: WSServerMessage) {
  const p = msg.payload as Record<string, unknown> | null;
  useGoalStateStore.getState().setGoal(p);
}

export function handleGoalRefining(msg: WSServerMessage) {
  const payload = msg.payload as { missionId?: unknown; active?: unknown };
  if (typeof payload.missionId !== 'string' || typeof payload.active !== 'boolean') return;
  useGoalStateStore.getState().setRefining(payload.missionId, payload.active);
}

export function handleGoalStateError(msg: WSServerMessage) {
  const payload = msg.payload as { message?: unknown };
  toast.error(typeof payload.message === 'string' ? payload.message : 'Goal mission update failed');
}
