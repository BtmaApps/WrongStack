import { useEffect } from 'react';
import type { AppProps } from '../app-props.js';
import type { State } from '../app-state.js';

/**
 * Is the user composing a prompt for the model? Not while a turn runs (its
 * connection is already open), and not for `/commands` or `!shell` lines,
 * which never reach the provider.
 */
function shouldWarmProvider(buffer: string, status: State['status']): boolean {
  if (status !== 'idle') return false;
  const text = buffer.trimStart();
  return text.length > 0 && !text.startsWith('/') && !text.startsWith('!');
}

/**
 * Warm the provider connection while the user types, so DNS and TLS are done
 * by the time they press Enter (`Provider.warm`). Runs on every keystroke;
 * the provider throttles to one small request per endpoint every few seconds.
 */
export function useProviderWarmup(
  agent: AppProps['agent'],
  buffer: string,
  status: State['status'],
): void {
  useEffect(() => {
    if (!shouldWarmProvider(buffer, status)) return;
    void agent.ctx.provider.warm?.(agent.ctx.model).catch(() => undefined);
  }, [agent, buffer, status]);
}
