import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangesView } from '../../src/components/ChangesView.js';
import { numberDiffRows, placeComments } from '../../src/components/review/review-diff-model.js';
import { useGitChangesStore } from '../../src/stores/git-changes-store.js';
import { useReviewStore } from '../../src/stores/review-store.js';
import { useSessionStore } from '../../src/stores/session-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: () => <div data-testid="monaco-diff-editor" />,
  loader: { config: vi.fn() },
}));
vi.mock('monaco-editor', () => ({ editor: { defineTheme: vi.fn(), setTheme: vi.fn() } }));

const OLD = 'alpha\nbeta\ngamma\n';
const NEW = 'alpha\nBETA\ngamma\n';

describe('numberDiffRows / placeComments', () => {
  const rows = numberDiffRows([
    { kind: 'ctx', text: 'alpha' },
    { kind: 'del', text: 'beta' },
    { kind: 'add', text: 'BETA' },
    { kind: 'ctx', text: 'gamma' },
  ]);

  it('numbers context on both sides, removals on old, additions on new', () => {
    expect(rows.map((r) => [r.oldLine, r.newLine])).toEqual([
      [1, 1],
      [2, undefined],
      [undefined, 2],
      [3, 3],
    ]);
  });

  it('keeps a comment on an unchanged line and marks a moved one outdated', () => {
    const at = (side: 'old' | 'new', line: number, lineText: string) => ({
      id: `${side}${line}`,
      scope: '/repo',
      path: 'f',
      side,
      line,
      lineText,
      body: 'b',
      createdAt: 0,
    });
    const { byAnchor, outdated } = placeComments(rows, [
      at('new', 2, 'BETA'),
      at('old', 2, 'beta'),
      at('new', 3, 'no longer here'),
    ]);
    expect(byAnchor.get('new:2')?.map((c) => c.id)).toEqual(['new2']);
    expect(byAnchor.get('old:2')?.map((c) => c.id)).toEqual(['old2']);
    expect(outdated.map((c) => c.id)).toEqual(['new3']);
  });
});

describe('ChangesView review comments', () => {
  beforeEach(() => {
    useReviewStore.setState({ comments: [] });
    useSessionStore.setState({ projectRoot: '/repo' });
    useUIStore.setState({ promptInsertRequest: null });
    useGitChangesStore.setState({
      selectedPath: 'src/example.ts',
      diff: { path: 'src/example.ts', oldText: OLD, newText: NEW },
      loadingDiff: false,
    });
  });

  afterEach(() => {
    cleanup();
    useGitChangesStore.getState().clear();
  });

  it('adds a line comment inline and sends the review to the composer', () => {
    render(<ChangesView className="h-full" />);

    // Comment on the added line (new side, line 2).
    fireEvent.click(screen.getByLabelText('Comment on this line: 2'));
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'Keep the original casing' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    expect(screen.getByText('Keep the original casing')).toBeTruthy();
    expect(useReviewStore.getState().comments).toMatchObject([
      { scope: '/repo', path: 'src/example.ts', side: 'new', line: 2, lineText: 'BETA' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Review \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send to chat/ }));

    expect(useUIStore.getState().promptInsertRequest).toBe(
      [
        'Code review of the working tree — please address this comment:',
        '',
        '1. src/example.ts:2',
        '   > BETA',
        '   Keep the original casing',
      ].join('\n'),
    );
    expect(useReviewStore.getState().comments).toHaveLength(0);
    expect(useUIStore.getState().currentView).toBe('chat');
  });

  it('labels removed and added lines apart for screen readers', () => {
    render(<ChangesView className="h-full" />);
    expect(screen.getByLabelText('Comment on this line: removed line 2')).toBeTruthy();
    expect(screen.getByLabelText('Comment on this line: 2')).toBeTruthy();
  });

  it('Esc discards the draft without adding a comment', () => {
    render(<ChangesView className="h-full" />);
    fireEvent.click(screen.getAllByLabelText(/Comment on this line/)[0]!);
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'never mind' } });
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(useReviewStore.getState().comments).toHaveLength(0);
  });

  it('keeps pending comments reachable when no file is selected', () => {
    useReviewStore.getState().add({
      scope: '/repo',
      path: 'src/other.ts',
      side: 'new',
      line: 7,
      lineText: 'x',
      body: 'check this',
    });
    useGitChangesStore.setState({ selectedPath: null, diff: null });

    render(<ChangesView className="h-full" />);

    expect(screen.getByText('src/other.ts')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send to chat/ })).toBeTruthy();
  });

  it('hides comments that belong to another project', () => {
    useReviewStore.getState().add({
      scope: '/another-repo',
      path: 'src/example.ts',
      side: 'new',
      line: 2,
      lineText: 'BETA',
      body: 'from elsewhere',
    });

    render(<ChangesView className="h-full" />);

    expect(screen.queryByText('from elsewhere')).toBeNull();
    expect(screen.getByRole('button', { name: /Review \(0\)/ })).toBeTruthy();
  });
});
