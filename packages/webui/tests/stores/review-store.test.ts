import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatReviewMessage,
  type ReviewComment,
  scopedComments,
  useReviewStore,
} from '../../src/stores/review-store.js';

// Mirrors the store's private caps.
const REVIEW_MAX_COMMENTS = 200;
const REVIEW_MAX_BODY_CHARS = 4_000;

const base = { scope: '/repo', path: 'src/a.ts', side: 'new' as const, line: 3, lineText: 'x' };

beforeEach(() => {
  useReviewStore.setState({ comments: [] });
});

describe('review store', () => {
  it('adds a trimmed comment and ignores a blank one', () => {
    const added = useReviewStore.getState().add({ ...base, body: '  rename this  ' });
    expect(added?.body).toBe('rename this');
    expect(useReviewStore.getState().add({ ...base, body: '   ' })).toBeNull();
    expect(useReviewStore.getState().comments).toHaveLength(1);
  });

  it('bounds body length and total count so persistence stays small', () => {
    const long = useReviewStore.getState().add({ ...base, body: 'x'.repeat(10_000) });
    expect(long?.body).toHaveLength(REVIEW_MAX_BODY_CHARS);
    for (let i = 0; i < REVIEW_MAX_COMMENTS + 5; i++) {
      useReviewStore.getState().add({ ...base, line: i + 1, body: `c${i}` });
    }
    const comments = useReviewStore.getState().comments;
    expect(comments).toHaveLength(REVIEW_MAX_COMMENTS);
    // Oldest fell off first.
    expect(comments.at(-1)?.body).toBe(`c${REVIEW_MAX_COMMENTS + 4}`);
  });

  it('deletes a comment edited down to nothing', () => {
    const c = useReviewStore.getState().add({ ...base, body: 'keep?' })!;
    useReviewStore.getState().update(c.id, 'changed');
    expect(useReviewStore.getState().comments[0]?.body).toBe('changed');
    useReviewStore.getState().update(c.id, '  ');
    expect(useReviewStore.getState().comments).toHaveLength(0);
  });

  it('clears one project scope and leaves the others', () => {
    useReviewStore.getState().add({ ...base, body: 'a' });
    useReviewStore.getState().add({ ...base, scope: '/other', body: 'b' });
    useReviewStore.getState().clearScope('/repo');
    expect(useReviewStore.getState().comments.map((c) => c.body)).toEqual(['b']);
  });
});

describe('scopedComments', () => {
  it('orders by file, then line, within one scope', () => {
    const mk = (path: string, line: number, scope = '/repo'): ReviewComment => ({
      ...base,
      id: `${path}:${line}`,
      scope,
      path,
      line,
      body: 'b',
      createdAt: 0,
    });
    const ordered = scopedComments(
      [mk('src/b.ts', 1), mk('src/a.ts', 9), mk('src/a.ts', 2), mk('src/a.ts', 1, '/other')],
      '/repo',
    );
    expect(ordered.map((c) => c.id)).toEqual(['src/a.ts:2', 'src/a.ts:9', 'src/b.ts:1']);
  });
});

describe('formatReviewMessage', () => {
  it('names each file and line, quotes the line, and keeps multi-line bodies', () => {
    const message = formatReviewMessage([
      {
        ...base,
        id: '1',
        line: 12,
        lineText: '  const x = 1;',
        body: 'use a clearer name',
        createdAt: 0,
      },
      {
        ...base,
        id: '2',
        path: 'src/b.ts',
        side: 'old',
        line: 4,
        lineText: 'return cache;',
        body: 'why was this removed?\nit guarded a race',
        createdAt: 0,
      },
    ]);
    expect(message).toBe(
      [
        'Code review of the working tree — please address these 2 comments:',
        '',
        '1. src/a.ts:12',
        '   > const x = 1;',
        '   use a clearer name',
        '',
        '2. src/b.ts:4 (removed line)',
        '   > return cache;',
        '   why was this removed?',
        '   it guarded a race',
      ].join('\n'),
    );
  });

  it('is empty for no comments', () => {
    expect(formatReviewMessage([])).toBe('');
  });
});
