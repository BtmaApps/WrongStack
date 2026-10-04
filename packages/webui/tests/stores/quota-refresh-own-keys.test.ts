import { afterEach, describe, expect, it } from 'vitest';
import { useProviderQuotaStore as store } from '../../src/stores/provider-quota-store.js';

afterEach(() => store.getState().clear());
describe('quota refresh key preservation', () => {
  it('retains special provider IDs as own JSON-roundtrippable data keys', () => {
    store.getState().clear();
    for (const providerId of ['__proto__', 'constructor', 'toString', 'ordinary']) {
      store.getState().applyRefreshes([{ providerId, ok: true }]);
    }
    const refreshes = store.getState().refreshes;
    expect(Object.getPrototypeOf(refreshes)).toBe(Object.prototype);
    expect(Object.keys(JSON.parse(JSON.stringify(refreshes)))).toHaveLength(4);
    for (const providerId of ['__proto__', 'constructor', 'toString', 'ordinary']) {
      expect(Object.hasOwn(refreshes, providerId)).toBe(true);
      expect(refreshes[providerId]?.providerId).toBe(providerId);
    }
    const providerId = '__proto__';
    store.getState().applyRefreshes([{ providerId, ok: false }]);
    expect(store.getState().refreshes[providerId]?.ok).toBe(false);
  });
});
