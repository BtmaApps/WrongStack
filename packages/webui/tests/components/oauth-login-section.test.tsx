import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthLoginSection } from '@/components/SettingsPanel/OAuthLoginSection';
import type { WrongStackWebSocketClient } from '@/lib/ws-client';
import type { WSServerMessage } from '@/types';

// Minimal i18n stand-in. `i18nOverrides` carries real translations for the
// per-provider guidance keys; anything else falls back to the key so tests can
// match on it. `default` is honored, so a missing key yields '' rather than the
// key itself — which is what the component relies on to pick the registry copy.
const { i18nOverrides, tStub } = vi.hoisted(() => {
  const overrides: Record<string, string> = {};
  return {
    i18nOverrides: overrides,
    tStub: (key: string, opts?: { default?: string }) => overrides[key] ?? opts?.default ?? key,
  };
});

vi.mock('@/i18n', () => ({
  useAppTranslation: () => ({ t: tStub }),
  i18n: { t: tStub },
}));
afterEach(cleanup);
beforeEach(() => {
  for (const key of Object.keys(i18nOverrides)) delete i18nOverrides[key];
});

describe('OAuth account UI', () => {
  it('shows the new registry flows and starts the selected account method', () => {
    const handlers = new Map<string, (message: WSServerMessage) => void>();
    const startOAuth = vi.fn();
    const ws = {
      on: (type: string, fn: (message: WSServerMessage) => void) => {
        handlers.set(type, fn);
        return () => handlers.delete(type);
      },
      listOAuthProviders: vi.fn(),
      startOAuth,
      cancelOAuth: vi.fn(),
    } as unknown as WrongStackWebSocketClient;
    render(<OAuthLoginSection ws={ws} />);
    act(() =>
      handlers.get('auth.oauth.providers')?.({
        type: 'auth.oauth.providers',
        payload: {
          providers: [
            {
              id: 'xai',
              providerId: 'xai',
              label: 'xAI / Grok',
              interactionTypes: ['device_code'],
            },
            {
              id: 'kimi',
              providerId: 'kimi-for-coding',
              label: 'Kimi Code',
              interactionTypes: ['device_code'],
            },
            {
              id: 'meta',
              providerId: 'meta',
              label: 'Meta / Muse',
              interactionTypes: ['device_code'],
            },
            {
              id: 'chatgpt-api',
              providerId: 'openai-chatgpt',
              label: 'Continue with ChatGPT',
              interactionTypes: ['browser'],
            },
          ],
        },
      }),
    );
    expect(screen.getByText('Continue with ChatGPT')).toBeTruthy();
    expect(screen.queryByText('settings:oauth.termsWarning')).toBeNull();
    const buttons = screen.getAllByText('settings:oauth.signIn');
    for (const [index, id] of ['xai', 'kimi', 'meta', 'chatgpt-api'].entries()) {
      fireEvent.click(buttons[index]!);
      expect(startOAuth).toHaveBeenLastCalledWith(id);
    }
  });
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

  it('renders multi-paragraph strategy notes and omits them when absent', () => {
    const handlers = new Map<string, (message: WSServerMessage) => void>();
    const ws = {
      on: (type: string, fn: (message: WSServerMessage) => void) => {
        handlers.set(type, fn);
        return () => handlers.delete(type);
      },
      listOAuthProviders: vi.fn(),
      startOAuth: vi.fn(),
      cancelOAuth: vi.fn(),
    } as unknown as WrongStackWebSocketClient;
    render(<OAuthLoginSection ws={ws} />);
    const claudeNote =
      'To spend your Claude subscription instead, run OmniRoute as a proxy, sign in with your ' +
      'Claude account on OmniRoute, then add OmniRoute as a provider here.';
    act(() =>
      handlers.get('auth.oauth.providers')?.({
        type: 'auth.oauth.providers',
        payload: {
          providers: [
            {
              id: 'claude',
              providerId: 'anthropic-oauth',
              label: 'Claude',
              description: 'Pro / Max → anthropic-oauth',
              notes: ['This login is for extra usage.', claudeNote],
              aliases: [],
              interactionTypes: ['browser'],
            },
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
    // Each note renders as its own paragraph rather than one truncated line.
    expect(screen.getByText('This login is for extra usage.')).toBeTruthy();
    expect(screen.getByText(claudeNote)).toBeTruthy();
    // A strategy without notes renders no guidance block at all.
    expect(screen.getAllByText('settings:oauth.signIn')).toHaveLength(2);
  });

  it('prefers translated guidance over the registry English fallback', () => {
    const handlers = new Map<string, (message: WSServerMessage) => void>();
    const ws = {
      on: (type: string, fn: (message: WSServerMessage) => void) => {
        handlers.set(type, fn);
        return () => handlers.delete(type);
      },
      listOAuthProviders: vi.fn(),
      startOAuth: vi.fn(),
      cancelOAuth: vi.fn(),
    } as unknown as WrongStackWebSocketClient;
    i18nOverrides['settings:oauth.guidance.claude'] = 'Erster Absatz.\n\nZweiter Absatz.';
    render(<OAuthLoginSection ws={ws} />);
    act(() =>
      handlers.get('auth.oauth.providers')?.({
        type: 'auth.oauth.providers',
        payload: {
          providers: [
            {
              id: 'claude',
              providerId: 'anthropic-oauth',
              label: 'Claude',
              notes: ['registry english fallback'],
              aliases: [],
              interactionTypes: ['browser'],
            },
          ],
        },
      }),
    );
    expect(screen.getByText('Erster Absatz.')).toBeTruthy();
    expect(screen.getByText('Zweiter Absatz.')).toBeTruthy();
    expect(screen.queryByText('registry english fallback')).toBeNull();
  });
});
