import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthLoginSection } from '@/components/SettingsPanel/OAuthLoginSection';
import type { WrongStackWebSocketClient } from '@/lib/ws-client';
import type { WSServerMessage } from '@/types';

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
  i18n: { t: (key: string) => key },
}));
afterEach(cleanup);

describe('OAuth account UI', () => {
  it('groups arbitrary aliases by provider metadata and cancels sign-in on unmount', () => {
    const handlers = new Map<string, (message: WSServerMessage) => void>();
    const startOAuth = vi.fn();
    const cancelOAuth = vi.fn();
    const ws = {
      on: (type: string, fn: (message: WSServerMessage) => void) => {
        handlers.set(type, fn);
        return () => handlers.delete(type);
      },
      listOAuthProviders: vi.fn(),
      startOAuth,
      cancelOAuth,
    } as unknown as WrongStackWebSocketClient;
    const ui = render(
      <OAuthLoginSection
        ws={ws}
        savedProviders={[{ id: 'personal-account', type: 'openrouter', hasActiveKey: true }]}
      />,
    );
    act(() =>
      handlers.get('auth.oauth.providers')?.({
        type: 'auth.oauth.providers',
        payload: {
          providers: [
            {
              id: 'openrouter',
              providerId: 'openrouter',
              label: 'OpenRouter',
              aliases: [],
              interactionTypes: ['browser'],
            },
          ],
        },
      }),
    );
    expect(screen.getByText('settings:oauth.accountCount')).toBeTruthy();
    fireEvent.click(screen.getByText('settings:oauth.accountCount'));
    expect(screen.getByText('personal-account')).toBeTruthy();
    fireEvent.click(screen.getByText('settings:oauth.retry'));
    expect(startOAuth).toHaveBeenCalledWith('openrouter', 'personal-account');
    ui.unmount();
    expect(cancelOAuth).toHaveBeenCalledWith('openrouter');
    expect(handlers.size).toBe(0);
  });
});
