import type { PluginAPI } from '@wrongstack/core/types';

interface HostState {
  abort: AbortController;
  extensionUnregister: (() => void) | null;
}

/** Reload and disposal belong to the API instance that owns the registration. */
export function createHostStates<T extends HostState>(create: () => T) {
  const hosts = new Map<PluginAPI, T>();
  function remove(api: PluginAPI): T | undefined {
    const state = hosts.get(api);
    if (!state) return;
    hosts.delete(api);
    state.abort.abort();
    const unregister = state.extensionUnregister;
    state.extensionUnregister = null;
    try {
      unregister?.();
    } catch {
      // The host may already have disposed its extension registry.
    }
    return state;
  }
  return {
    reset(api: PluginAPI): T {
      remove(api);
      const state = create();
      hosts.set(api, state);
      return state;
    },
    remove,
    values: () => hosts.values(),
  };
}

export function providerSignal(state: HostState, context: unknown): AbortSignal {
  const signal = (context as { signal?: AbortSignal } | null)?.signal;
  return signal ? AbortSignal.any([state.abort.signal, signal]) : state.abort.signal;
}
