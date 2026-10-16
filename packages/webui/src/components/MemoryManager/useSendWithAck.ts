import { useCallback } from 'react';
import type { useWebSocket } from '@/hooks/useWebSocket';
import type { SageEntry } from '@/types';

interface SendWithAckDeps {
  client: ReturnType<typeof useWebSocket>['client'];
  mutationGenerationRef: { current: number };
  mutationCleanupRef: { current: (() => void) | null };
  mountedRef: { current: boolean };
  setMutationError: (error: string | null) => void;
}

/**
 * Send a SAGE mutation and settle on its reply: a newer mutation or an
 * unmount supersedes it, and a silent store surfaces as an error after 20 s.
 */
export function useSendWithAck({
  client,
  mutationGenerationRef,
  mutationCleanupRef,
  mountedRef,
  setMutationError,
}: SendWithAckDeps) {
  return useCallback(
    (
      type: 'memory.sage.candidateResolve' | 'memory.sage.recover' | 'memory.sage.update',
      send: () => void,
      onResponse: (payload: { error?: string | undefined; memory?: SageEntry | undefined }) => void,
    ) => {
      const generation = ++mutationGenerationRef.current;
      mutationCleanupRef.current?.();
      setMutationError(null);

      let off = () => {};
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        off();
        if (mutationCleanupRef.current === cleanup) mutationCleanupRef.current = null;
      };

      off = client.on(type, (message) => {
        if (generation !== mutationGenerationRef.current || !mountedRef.current) {
          cleanup();
          return;
        }
        cleanup();
        onResponse(message.payload);
      });

      timeout = setTimeout(() => {
        if (generation !== mutationGenerationRef.current || !mountedRef.current) return;
        cleanup();
        setMutationError(
          'The memory store did not respond. Check the WebSocket connection and try again.',
        );
      }, 20_000);

      mutationCleanupRef.current = cleanup;
      send();
    },
    [client, mountedRef, mutationCleanupRef, mutationGenerationRef, setMutationError],
  );
}
