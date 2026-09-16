import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RepositoryHistoryView } from '../../src/components/RepositoryHistoryView';

const { handlers, client } = vi.hoisted(() => {
  const handlers = new Map<string, (message: { payload: unknown }) => void>();
  return {
    handlers,
    client: {
      on: (type: string, callback: (message: { payload: unknown }) => void) => {
        handlers.set(type, callback);
        return () => handlers.delete(type);
      },
      getGitHistory: vi.fn(),
      getGitChanges: vi.fn(),
      getGitCommitDetail: vi.fn(),
      getGitCommitFileDiff: vi.fn(),
    },
  };
});
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => ({ client }) }));
vi.mock('../../src/components/DiffView', () => ({ DiffView: () => <div>Revision diff</div> }));

afterEach(() => {
  cleanup();
  handlers.clear();
  vi.clearAllMocks();
});

it('restores keyboard focus to the changed file after closing its revision dialog', async () => {
  render(<RepositoryHistoryView />);
  const hash = 'a'.repeat(40);
  act(() =>
    handlers.get('git.history')?.({
      payload: {
        commits: [
          {
            hash,
            parents: [],
            subject: 'Review update',
            author: 'Ada',
            email: 'ada@example.test',
            authoredAt: '2026-09-15T10:00:00Z',
            refs: [],
          },
        ],
        refs: [],
        skip: 0,
        hasMore: false,
      },
    }),
  );
  act(() =>
    handlers.get('git.commit_detail')?.({
      payload: {
        hash,
        files: [{ path: 'src/example.ts', status: 'M', added: 2, deleted: 1 }],
      },
    }),
  );
  const file = screen.getByRole('button', { name: /example.ts/ });
  fireEvent.click(file);
  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(file);
});
