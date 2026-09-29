import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryValidity } from '../../src/components/MemoryManager/MemoryValidity';
import { MemoryValidityEditor } from '../../src/components/MemoryManager/MemoryValidityEditor';
import { emptyDraft } from '../../src/components/MemoryManager/shared';
import { useMemoryInjectorTraceStore } from '../../src/stores/memory-injector-store';

afterEach(cleanup);
afterEach(() => useMemoryInjectorTraceStore.getState().clear());
const validity = {
  statement: 'Only without session overrides.',
  checks: [{ type: 'source_contains' as const, path: 'retry.ts', text: 'quota = 3' }],
};
it('shows a Companion judgment only for its observed revision and isolates session stores', () => {
  const judgment = {
    memoryId: 'm',
    observedRevision: 2,
    at: '2026-09-29T00:00:00Z',
    verdict: 'contradicted',
    summary: 'The source now sets quota to five.',
    evidence: [{ path: 'retry.ts', quote: 'export const quota = 5;' }],
  };
  useMemoryInjectorTraceStore.getState().pushCompanionReview(judgment);
  const { rerender } = render(<MemoryValidity memoryId="m" validity={validity} revision={2} />);
  expect(screen.getByText(judgment.summary)).toBeTruthy();
  expect(screen.getByText('export const quota = 5;')).toBeTruthy();
  rerender(<MemoryValidity memoryId="m" validity={validity} revision={3} />);
  expect(screen.queryByText(judgment.summary)).toBeNull();
  useMemoryInjectorTraceStore
    .for('another-session')
    .getState()
    .pushCompanionReview({ ...judgment, memoryId: 'private' });
  expect(useMemoryInjectorTraceStore.getState().companionReviews.private).toBeUndefined();
});
it('shows observations as historical and hides results belonging to another memory revision', () => {
  const review = {
    observedRevision: 2,
    checkedAt: '2026-09-29T00:00:00Z',
    applicability: 'unknown' as const,
    checks: [{ path: 'retry.ts', text: 'quota = 3', status: 'satisfied' as const }],
  };
  const { rerender } = render(<MemoryValidity validity={validity} revision={2} review={review} />);
  expect(screen.getByText(validity.statement)).toBeTruthy();
  expect(screen.getByText('Expected text found at observation time')).toBeTruthy();
  expect(screen.getByText(/Source files may have changed since/)).toBeTruthy();
  rerender(<MemoryValidity validity={validity} revision={3} review={review} />);
  expect(screen.queryByText('Expected text found at observation time')).toBeNull();
  expect(screen.getByText('No source observation for this memory revision.')).toBeTruthy();
});
it('edits conditions and adds bounded literal checks without changing the record', () => {
  const onChange = vi.fn();
  render(<MemoryValidityEditor draft={emptyDraft()} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Valid when'), { target: { value: validity.statement } });
  expect(onChange.mock.calls.at(-1)?.[0].validityStatement).toBe(validity.statement);
  fireEvent.click(screen.getByRole('button', { name: 'Add source check' }));
  expect(onChange.mock.calls.at(-1)?.[0].validityChecks).toEqual([
    { type: 'source_contains', path: '', text: '' },
  ]);
});
