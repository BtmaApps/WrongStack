import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProviderModels } from '@/hooks/useProviderModels';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (message: unknown) => void>(),
  listSaved: vi.fn(),
  listModels: vi.fn(),
}));
vi.mock('@/stores', () => ({
  useConfigStore: (select: (state: unknown) => unknown) => select({ wsUrl: 'ws://test' }),
}));
vi.mock('@/stores/local-prefs', () => ({
  useLocalPrefs: (select: (state: unknown) => unknown) =>
    select({ favoriteModels: [], disabledModels: [] }),
}));
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    listSavedProviders: mocks.listSaved,
    listProviderModels: mocks.listModels,
  }),
}));
vi.mock('@/lib/ws-client', () => ({
  getWSClient: () => ({
    on: (type: string, handler: (message: unknown) => void) => {
      mocks.handlers.set(type, handler);
      return () => mocks.handlers.delete(type);
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.handlers.clear();
});

describe('model candidates from auth profiles', () => {
  it('keeps account aliases distinct and refreshes only the profile whose saved configuration changed', async () => {
    mocks.listModels.mockImplementation((provider: string) =>
      mocks.handlers.get('provider.models')?.({
        payload: { provider, models: [{ id: 'same-model', name: provider }] },
      }),
    );
    const { result } = renderHook(() => useProviderModels(true));
    const personal = { id: 'personal-account', type: 'openai' };
    const work = { id: 'work-account', type: 'openai' };
    act(() =>
      mocks.handlers.get('providers.saved')?.({ payload: { providers: [personal, work] } }),
    );
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map(({ provider, providerType }) => [provider, providerType])).toEqual([
      ['personal-account', 'openai'],
      ['work-account', 'openai'],
    ]);
    mocks.listModels.mockClear();
    act(() =>
      mocks.handlers.get('providers.saved')?.({
        payload: { providers: [personal, { ...work, models: ['same-model'] }] },
      }),
    );
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledOnce());
    expect(mocks.listModels).toHaveBeenCalledWith('work-account');
    act(() => mocks.handlers.get('providers.saved')?.({ payload: { providers: [personal] } }));
    await waitFor(() =>
      expect(result.current.map((candidate) => candidate.provider)).toEqual(['personal-account']),
    );
  });
});
