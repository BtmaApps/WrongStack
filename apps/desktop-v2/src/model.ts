export interface Project {
  id: string;
  name: string;
  root: string;
  createdAt: number;
}
export interface Session {
  id: string;
  projectId: string;
  title: string;
  kind: 'agent' | 'terminal';
  workdir: string;
  status: 'starting' | 'running' | 'stopped' | 'error' | 'interrupted';
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  error: string | null;
}
export interface Snapshot {
  projects: Project[];
  sessions: Session[];
  hostPid: number;
  layout: string | null;
  appearance?: string | null;
}
export const initialSnapshot: Snapshot = { projects: [], sessions: [], hostPid: 0, layout: null };
export const isLive = (s: Session): boolean => s.status === 'running' || s.status === 'starting';
export function visibleSessions(
  snapshot: Snapshot,
  project: string | null,
  search: string,
  status: string,
): Session[] {
  const term = search.trim().toLowerCase();
  const names = new Map(snapshot.projects.map((p) => [p.id, p.name]));
  return snapshot.sessions.filter(
    (s) =>
      (!project || s.projectId === project) &&
      (status === 'all' ||
        (status === 'active'
          ? isLive(s)
          : status === 'attention'
            ? s.status === 'error' || s.status === 'interrupted'
            : !isLive(s))) &&
      (!term ||
        `${s.title} ${s.workdir} ${names.get(s.projectId) ?? ''}`.toLowerCase().includes(term)),
  );
}
export function age(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
