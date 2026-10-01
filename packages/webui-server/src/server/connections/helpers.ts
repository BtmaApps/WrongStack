import * as net from 'node:net';
import { errMessage } from '../ws-utils.js';
import type { ConnectionHealthService } from './types.js';

const RESTART_POLL_INTERVAL_MS = 250;
const RESTART_DEADLINE_MS = 3_000;

/**
 * Raw socket probe — checks if anything is listening on an IPC endpoint
 * (Unix domain socket or Windows named pipe) without sending protocol frames.
 * Used for services whose client API offers no non-spawning probe.
 */
export function isEndpointAlive(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection(endpoint);
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, 500);
    timer.unref?.();
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(false);
    });
  });
}

/**
 * Give a shutdown signal time to take effect before re-establishing the
 * connection. When a probe is provided, polls until the server confirms it
 * is down. Falls back to a single sleep when no probe is available.
 */
export async function waitForShutdown(probe?: () => Promise<boolean>): Promise<void> {
  if (!probe) {
    await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_INTERVAL_MS));
    return;
  }
  const deadline = Date.now() + RESTART_DEADLINE_MS;
  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stillUp = await Promise.race([
        probe(),
        new Promise<boolean>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Shutdown probe exceeded the restart deadline')),
            remainingMs,
          );
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (!stillUp) return;
    } catch (error) {
      if (timer) clearTimeout(timer);
      throw new Error(`Shutdown probe failed: ${errMessage(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_INTERVAL_MS));
  }
  throw new Error('Daemon did not stop before the restart deadline; restart was not verified.');
}

export function failureService(
  id: ConnectionHealthService['id'],
  label: string,
  required: boolean,
  mode: string,
  error: unknown,
  latencyMs?: number,
): ConnectionHealthService {
  const message = errMessage(error);
  return {
    id,
    label,
    status: 'error',
    required,
    mode,
    detail: message,
    lastError: message,
    ...(typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0
      ? { latencyMs }
      : {}),
  };
}

export function isOfflineConnectionError(error: unknown): boolean {
  const message = errMessage(error);
  return /(?:ENOENT|ECONNREFUSED|not found|not running|unavailable|connect failed)/iu.test(message);
}
