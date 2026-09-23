import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from '../../src/components/ui/pagination';
import { i18n } from '../../src/i18n';

describe('Pagination', () => {
  // The buttons' accessible names come from i18n; rendering before the
  // translator is ready yields raw keys ('pagination.previousPage') and the
  // role queries race. Pin the language before every test, like the other
  // component suites do.
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => cleanup());

  it('hides when every item fits on one page', () => {
    render(
      <Pagination
        page={1}
        pageSize={12}
        totalItems={12}
        onPageChange={vi.fn()}
        itemLabel="boards"
      />,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('reports the visible range and changes pages', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        pageSize={12}
        totalItems={31}
        onPageChange={onPageChange}
        itemLabel="boards"
      />,
    );
    expect(screen.getByText('13–24 of 31 boards')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
  });
});
