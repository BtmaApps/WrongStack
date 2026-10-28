import { describe, expect, it } from 'vitest';
import type { Session } from '../src/model';
import {
  historyHasContent,
  historyMatches,
  historyTitle,
  openHistoryLinks,
} from '../src/project-history-model';

const session = (
  id: string,
  projectId = 'project-a',
  status: Session['status'] = 'running',
  kind: Session['kind'] = 'agent',
): Session => ({
  id,
  projectId,
  status,
  kind,
  title: `Desktop ${id}`,
  workdir: 'C:/project',
  createdAt: 0,
  updatedAt: 0,
  exitCode: null,
  error: null,
});
describe('project history ownership', () => {
  it('does not infer an empty journal from zero or missing summary counters', () => {
    expect(historyHasContent({ messageCount: 0, tokenTotal: 0, isEmpty: false })).toBe(true);
    expect(historyHasContent({ messageCount: 0 })).toBe(true);
    expect(historyHasContent({ isEmpty: true })).toBe(false);
  });
  it('uses recorded names and native titles without treating a service carrier as the open human session', () => {
    expect(historyTitle({ title: 'Automatic' }, session('one'))).toBe('Desktop one');
    expect(historyTitle({ name: 'Named', title: 'Automatic' }, session('one'))).toBe('Named');
    expect(
      historyMatches(
        { title: 'Automatic', provider: 'local', outcome: 'completed' },
        'desktop one',
        '',
        '',
        true,
        'Desktop one',
      ),
    ).toBe(true);
    expect(
      historyMatches({ provider: 'local', outcome: 'completed' }, '', 'remote', '', true),
    ).toBe(false);
    expect(historyMatches({ outcome: 'completed' }, '', '', 'open', false)).toBe(false);
  });
  it('reads identities only for this project’s live native agents and retains successes when another engine is unavailable', async () => {
    const read: string[] = [];
    const links = await openHistoryLinks(
      'project-a',
      [
        session('a'),
        session('missing'),
        session('foreign', 'project-b'),
        session('terminal', 'project-a', 'running', 'terminal'),
        session('stopped', 'project-a', 'stopped'),
      ],
      async (id) => {
        read.push(id);
        if (id === 'missing') throw Error('Engine unavailable');
        return { sessionId: 'recorded-a' };
      },
    );
    expect(read.sort()).toEqual(['a', 'missing']);
    expect(Object.keys(links)).toEqual(['recorded-a']);
    expect(links['recorded-a']?.id).toBe('a');
  });
  it('bounds concurrent identity reads while finding more than one batch of owners', async () => {
    let active = 0,
      peak = 0;
    const links = await openHistoryLinks(
      'project-a',
      Array.from({ length: 19 }, (_, index) => session(String(index))),
      async (id) => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return { sessionId: `core-${id}` };
      },
    );
    expect(peak).toBeLessThanOrEqual(8);
    expect(Object.keys(links)).toHaveLength(19);
  });
});
