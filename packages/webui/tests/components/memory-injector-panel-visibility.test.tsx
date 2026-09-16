import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryInjectorPanel } from '../../src/components/MemoryManager/MemoryInjectorPanel';

afterEach(cleanup);

it('removes the closed drawer from accessible navigation and restores it when opened', () => {
  const { rerender } = render(<MemoryInjectorPanel open={false} onClose={() => {}} />);
  const panel = screen.getByTestId('memory-injector-panel');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(panel.hasAttribute('inert')).toBe(true);
  rerender(<MemoryInjectorPanel open onClose={() => {}} />);
  expect(screen.getByRole('dialog')).toBe(panel);
  expect(panel.hasAttribute('inert')).toBe(false);
  rerender(<MemoryInjectorPanel open={false} onClose={() => {}} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(panel.hasAttribute('inert')).toBe(true);
});
