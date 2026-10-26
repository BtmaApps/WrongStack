import { describe, expect, it } from 'vitest';
import { initialSnapshot, type Session, type Snapshot, visibleSessions } from '../src/model';

const session = (id: string, projectId: string, status: Session['status']): Session => ({
  id,
  projectId,
  title: `Session ${id}`,
  kind: 'agent',
  workdir: `/repo/${projectId}`,
  status,
  createdAt: 1,
  updatedAt: 1,
  exitCode: null,
  error: null,
});
const snapshot: Snapshot = {
  ...initialSnapshot,
  projects: [
    { id: 'a', name: 'WrongStack', root: '/repo/a', createdAt: 1 },
    { id: 'b', name: 'Website', root: '/repo/b', createdAt: 1 },
  ],
  sessions: [
    session('1', 'a', 'running'),
    session('2', 'b', 'starting'),
    session('3', 'a', 'interrupted'),
    session('4', 'b', 'stopped'),
  ],
};
describe('fleet session projections', () => {
  it('shows concurrent sessions across projects and preserves history', () => {
    expect(visibleSessions(snapshot, null, '', 'all')).toHaveLength(4);
    expect(visibleSessions(snapshot, null, '', 'active').map((s) => s.id)).toEqual(['1', '2']);
    expect(visibleSessions(snapshot, 'a', '', 'all').map((s) => s.id)).toEqual(['1', '3']);
  });
  it('finds project names, workdirs, and session titles without mixing project boundaries', () => {
    expect(visibleSessions(snapshot, null, ' website ', 'active').map((s) => s.id)).toEqual(['2']);
    expect(visibleSessions(snapshot, 'a', 'website', 'all')).toEqual([]);
    expect(visibleSessions(snapshot, null, '/repo/a', 'attention').map((s) => s.id)).toEqual(['3']);
    expect(visibleSessions(snapshot, null, 'session 4', 'history').map((s) => s.id)).toEqual(['4']);
  });
  it('handles an empty registry and unknown project without inventing sessions', () => {
    expect(visibleSessions(initialSnapshot, null, '', 'all')).toEqual([]);
    expect(visibleSessions(snapshot, 'unknown', '', 'active')).toEqual([]);
  });
});
