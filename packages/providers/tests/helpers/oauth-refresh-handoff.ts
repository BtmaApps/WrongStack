import {
  OAuthRefreshCoordinator,
  resetSharedOAuthRefreshState,
} from '../../src/oauth-refresh-coordinator.js';

export async function refreshHandoff(mode: 'pending' | 'settled') {
  resetSharedOAuthRefreshState();
  const tokens = {
    accessToken: 'new-access',
    refreshKey: 'new-refresh',
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
  let release!: (value: typeof tokens) => void;
  const gate = new Promise<typeof tokens>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let persisted = 0;
  let applied = 0;
  const make = () =>
    new OAuthRefreshCoordinator({
      initialRefreshKey: 'old-refresh',
      initialExpiresAt: 0,
      label: 'audit-refresh-handoff',
      hooks: {
        refreshFn: () =>
          ++calls === 1 ? gate : Promise.reject(new Error('refresh token already rotated')),
        projectTokens: (value: typeof tokens) => value,
        applyTokens: () => {
          applied++;
        },
        formatPayload: (value: typeof tokens) => value,
        onRefresh: () => {
          persisted++;
        },
      },
    });
  const first = make().runRefresh();
  if (mode === 'settled') {
    release(tokens);
    // Let the network promise's finally run before its consumer continuation.
    await Promise.resolve();
  }
  const second = make().runRefresh();
  if (mode === 'pending') release(tokens);
  const outcomes = (await Promise.allSettled([first, second])).map((result) => result.status);
  resetSharedOAuthRefreshState();
  return { calls, persisted, applied, outcomes };
}
