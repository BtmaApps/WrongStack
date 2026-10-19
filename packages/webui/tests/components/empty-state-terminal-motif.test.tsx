import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState terminal motif', () => {
  it('renders the ASCII frame and blinking cursor only in terminal mode', () => {
    const { container, rerender } = render(
      <EmptyState title="No files" description="Open one" motif="terminal" />,
    );

    expect(container.querySelector('.ws-term-ascii')).not.toBeNull();
    expect(container.querySelector('.ws-term-cursor')).not.toBeNull();
    // Decorative motif is hidden from assistive tech; the real title stays.
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).not.toContain(
      'No files',
    );
    expect(screen.getByText('No files')).toBeDefined();

    // Default mode keeps the vector art and gains no terminal motif.
    rerender(<EmptyState title="No files" description="Open one" icon={<span>x</span>} />);
    expect(container.querySelector('.ws-term-ascii')).toBeNull();
    expect(container.querySelector('.ws-term-cursor')).toBeNull();
    expect(container.querySelector('.ws-empty-art')).not.toBeNull();
  });
});
