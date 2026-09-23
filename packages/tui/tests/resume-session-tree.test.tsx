import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { reducer } from '../src/app.js';
import type { ResumeSessionEntry } from '../src/app-state-core-types.js';
import { ResumePicker } from '../src/components/resume-picker.js';
import { orderResumeEntries } from '../src/resume-session-tree.js';
import { initial } from './reducer.test.js';

const entry = (id: string, extra: Partial<ResumeSessionEntry> = {}): ResumeSessionEntry => ({
  id,
  title: `title ${id}`,
  startedAt: '2026-09-24T10:00:00.000Z',
  tokenTotal: 0,
  iterationCount: 0,
  toolCallCount: 0,
  toolErrorCount: 0,
  ...extra,
});

const wt = { root: '/repo-feature', name: 'repo-feature', branch: 'feature/x' };

describe('orderResumeEntries', () => {
  it('puts this worktree first as a fork tree, then each other worktree', () => {
    const ordered = orderResumeEntries([
      entry('far', { worktree: wt }),
      entry('fork', { forkedFrom: 'root' }),
      entry('root'),
      entry('far-fork', { worktree: wt, forkedFrom: 'far' }),
    ]);
    expect(ordered.map((e) => [e.id, e.treePrefix])).toEqual([
      ['root', undefined],
      ['fork', '└─ '],
      ['far', undefined],
      ['far-fork', '└─ '],
    ]);
  });
});

describe('resumePickerOpen', () => {
  it('stores the sessions in tree order, whatever order the host listed them in', () => {
    const state = reducer(initial(), {
      type: 'resumePickerOpen',
      sessions: [entry('fork', { forkedFrom: 'root' }), entry('other'), entry('root')],
    });
    expect(state.resumePicker.sessions.map((e) => e.id)).toEqual(['other', 'root', 'fork']);
  });
});

describe('ResumePicker tree rows', () => {
  it('draws fork connectors and the worktree tag', () => {
    const sessions = orderResumeEntries([
      entry('root', { name: 'Parent task' }),
      entry('fork', { name: 'Forked try', forkedFrom: 'root' }),
      entry('far', { name: 'Feature work', worktree: wt }),
    ]);
    const { lastFrame, unmount } = render(
      <ResumePicker sessions={sessions} selected={0} busy={false} />,
    );
    const frame = lastFrame() ?? '';
    unmount();
    expect(frame).toMatch(/└─ Forked try/);
    expect(frame).toContain('[repo-feature · feature/x] Feature work');
  });
});
