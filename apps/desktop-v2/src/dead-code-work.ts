import { useSyncExternalStore } from 'react';

interface DeadCodeWork {
  report: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  selected: string[];
  busy: string;
  error: string;
  notice: string;
  scanScope: string;
  includePublicApi: boolean;
}
const empty: DeadCodeWork = {
  report: null,
  plan: null,
  result: null,
  selected: [],
  busy: '',
  error: '',
  notice: '',
  scanScope: '',
  includePublicApi: false,
};
const work = new Map<string, DeadCodeWork>();
const listeners = new Set<() => void>();
export const getDeadCodeWork = (projectId: string): DeadCodeWork => work.get(projectId) ?? empty;
export function updateDeadCodeWork(projectId: string, changes: Partial<DeadCodeWork>) {
  work.set(projectId, { ...getDeadCodeWork(projectId), ...changes });
  for (const listener of listeners) listener();
}
export function beginDeadCodeWork(projectId: string, label: string): boolean {
  if (getDeadCodeWork(projectId).busy) return false;
  updateDeadCodeWork(projectId, { busy: label, error: '', notice: '' });
  return true;
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useDeadCodeWork(projectId: string) {
  return useSyncExternalStore(subscribe, () => getDeadCodeWork(projectId));
}
