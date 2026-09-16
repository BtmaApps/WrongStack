import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MainViewSlot } from '../../src/components/MainViewSlot';

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
  i18n: { t: (key: string) => key },
}));
vi.mock('../../src/components/view-registry', () => ({
  PANEL_CLOSE_TO_CHAT_SENTINEL: 'PANEL_CLOSE_TO_CHAT',
  VIEW_REGISTRY: {
    analytics: {
      Component: () => {
        throw new Error('Failed view');
      },
      wrapperClassName: '',
      boundaryNameKey: 'analytics',
      loadingLabelKey: null,
    },
    settings: {
      Component: () => <div>Working settings</div>,
      wrapperClassName: '',
      boundaryNameKey: 'settings',
      loadingLabelKey: null,
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('lets navigation recover from a failed view without retrying that view', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { rerender } = render(<MainViewSlot view="analytics" onCloseToChat={() => {}} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  rerender(<MainViewSlot view="settings" onCloseToChat={() => {}} />);
  expect(screen.getByText('Working settings')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
