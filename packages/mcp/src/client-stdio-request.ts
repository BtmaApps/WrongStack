import type { MCPClientInternals, PendingStdioRequest } from './client-internals.js';
import type { JsonRpcRequest } from './client-types.js';
import { MCP_CONSTANTS } from './constants.js';
import type { JsonRpcResponse } from './contracts.js';
import { nextJsonRpcId } from './transport-base.js';

/**
 * The effective per-request timeout: an explicit positive `timeoutMs` wins,
 * then the client's configured `requestTimeoutMs`, then the package default.
 */
export function resolveRequestTimeoutMs(
  configuredMs: number | undefined,
  timeoutMs: number | undefined,
): number {
  const defaultTimeoutMs =
    typeof configuredMs === 'number' && Number.isFinite(configuredMs) && configuredMs > 0
      ? configuredMs
      : MCP_CONSTANTS.REQUEST_TIMEOUT_MS;
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : defaultTimeoutMs;
}

/**
 * Send one JSON-RPC request over the stdio child and settle it from the
 * matching response line (routed by `receiveStdioLine` through `pending`).
 */
export function sendStdioRequest(
  self: MCPClientInternals,
  method: string,
  params: unknown,
  effectiveTimeoutMs: number,
  opts?: { signal?: AbortSignal | undefined },
): Promise<JsonRpcResponse> {
  const signal = opts?.signal;
  if (signal?.aborted) {
    const err = new Error(`MCP "${self.opts.name}" request "${method}" aborted before send`);
    err.name = 'AbortError';
    return Promise.reject(err);
  }
  const id = self.nextId;
  self.nextId = nextJsonRpcId(id);
  const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    // Abort support: drop the pending entry, notify the server per the MCP
    // cancellation spec (`notifications/cancelled`, best-effort — the
    // server SHOULD stop processing), and surface an AbortError so the
    // executor classifies it as user cancellation (never retried).
    const onAbort = signal
      ? () => {
          const pending = self.pending.get(id);
          self.pending.delete(id);
          if (pending) clearTimeout(pending.timer);
          void self
            .notify('notifications/cancelled', {
              requestId: id,
              reason: 'client aborted',
            })
            .catch(() => {
              /* best-effort — the child may already be gone */
            });
          const err = new Error(`MCP "${self.opts.name}" request "${method}" aborted by client`);
          err.name = 'AbortError';
          reject(err);
        }
      : undefined;
    if (signal && onAbort) signal.addEventListener('abort', onAbort, { once: true });
    const detach = () => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    };
    const onTimeout = () => {
      // A server waiting on the user's elicitation answer is not stalled.
      if (self.serverRequests.awaitingUser) {
        entry.timer = setTimeout(onTimeout, effectiveTimeoutMs);
        return;
      }
      self.pending.delete(id);
      detach();
      reject(
        new Error(
          `MCP "${self.opts.name}" request "${method}" timed out after ${effectiveTimeoutMs}ms`,
        ),
      );
    };
    const entry = {
      resolve: (res: JsonRpcResponse) => {
        clearTimeout(entry.timer);
        detach();
        resolve(res);
      },
      reject: (err: Error) => {
        clearTimeout(entry.timer);
        detach();
        reject(err);
      },
      timer: setTimeout(onTimeout, effectiveTimeoutMs),
    };
    self.pending.set(id, entry);
    const stdin = self.child?.stdin;
    if (!stdin || stdin.destroyed) {
      // No writable stdin (child never spawned, already exited, or stream
      // destroyed). Reject immediately instead of leaving the request
      // pending until it times out.
      const pending = self.pending.get(id);
      self.pending.delete(id);
      if (pending) clearTimeout(pending.timer);
      detach();
      reject(new Error(`MCP "${self.opts.name}" request "${method}": stdin not writable`));
      return;
    }
    try {
      stdin.write(JSON.stringify(req) + '\n');
    } catch (err) {
      const pending = self.pending.get(id);
      self.pending.delete(id);
      if (pending) clearTimeout(pending.timer);
      detach();
      reject(err);
    }
  });
}

/**
 * Reject every in-flight stdio request. Used when the underlying
 * transport dies — without this, callers awaiting `tools/call` over a
 * killed stdio child or a closed transport would hang indefinitely.
 */
export function failPendingRequests(
  pending: Map<number, PendingStdioRequest>,
  reason: string,
): void {
  if (pending.size === 0) return;
  const err = new Error(reason);
  for (const [, entry] of pending) {
    try {
      clearTimeout(entry.timer);
      entry.reject(err);
    } catch {
      /* ignore */
    }
  }
  pending.clear();
}
