import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenAICodexProviderOptions } from '../src/openai-codex.js';

const captured = vi.hoisted(() => [] as OpenAICodexProviderOptions[]);
vi.mock('../src/openai-codex.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  OpenAICodexProvider: class {
    constructor(opts: OpenAICodexProviderOptions) {
      captured.push(opts);
    }
  },
}));

import {
  makeProviderFromConfig,
  setOAuthTokenPersister,
  setProviderModelPersister,
} from '../src/index.js';

afterEach(() => {
  captured.length = 0;
  setOAuthTokenPersister(undefined);
  setProviderModelPersister(undefined);
});

describe('OAuth factory persistence identity', () => {
  it('binds each account to its originating key and advances the source after rotation', () => {
    const persist = vi.fn();
    const models = vi.fn();
    setOAuthTokenPersister(persist);
    setProviderModelPersister(models);
    for (const alias of ['personal', 'work']) {
      makeProviderFromConfig(alias, {
        type: 'openai-codex',
        family: 'openai-codex',
        activeKey: 'selected',
        apiKeys: [
          { label: 'unused', apiKey: 'unused', createdAt: '' },
          {
            label: 'selected',
            apiKey: `${alias}-access`,
            refreshToken: `${alias}-refresh`,
            createdAt: '',
          },
        ],
      });
    }
    const work = captured[1]!;
    work.onRefresh!({
      accessToken: 'work-new',
      refreshToken: 'work-refresh-new',
      expiresAt: 1000,
      accountId: undefined,
    });
    expect(persist).toHaveBeenLastCalledWith(
      'work',
      expect.objectContaining({ accessToken: 'work-new' }),
      {
        label: 'selected',
        accessToken: 'work-access',
        refreshToken: 'work-refresh',
      },
    );
    work.onRefresh!({
      accessToken: 'work-newer',
      refreshToken: 'work-refresh-new',
      expiresAt: 2000,
      accountId: undefined,
    });
    expect(persist).toHaveBeenLastCalledWith(
      'work',
      expect.objectContaining({ accessToken: 'work-newer' }),
      {
        label: 'selected',
        accessToken: 'work-new',
        refreshToken: 'work-refresh-new',
      },
    );
    const live = [{ id: 'model', name: 'Model' }];
    work.onModels!(live);
    expect(models).toHaveBeenCalledWith('work', live, {
      label: 'selected',
      accessToken: 'work-newer',
      refreshToken: 'work-refresh-new',
    });
    captured[0]!.onRefresh!({
      accessToken: 'personal-new',
      refreshToken: 'personal-refresh',
      expiresAt: 3000,
      accountId: undefined,
    });
    expect(persist).toHaveBeenLastCalledWith('personal', expect.anything(), {
      label: 'selected',
      accessToken: 'personal-access',
      refreshToken: 'personal-refresh',
    });
  });
});
