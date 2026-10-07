import type { MCPRegistry } from '@wrongstack/mcp';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  handleMcpAuthLogin,
  handleMcpAuthLogout,
  handleMcpAuthStatus,
} from '../src/server/mcp-auth-handlers.js';
import type { WSClientMessage } from '../src/server/types.js';

function socket() {
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = {
    readyState: 1,
    send: (data: string) => frames.push(JSON.parse(data)),
  } as unknown as WebSocket;
  return { ws, frames };
}
const message = (payload: object = { name: 'test' }) =>
  ({ type: 'mcp.auth.login', payload }) as WSClientMessage;

describe('MCP OAuth WebSocket handlers', () => {
  it('returns authorization status and reports registry errors', async () => {
    const { ws, frames } = socket();
    const authorizationStatus = vi.fn().mockResolvedValue({ name: 'test', authorized: true });
    const registry = { authorizationStatus } as unknown as MCPRegistry;
    await handleMcpAuthStatus(ws, message(), 'config.json', registry);
    expect(authorizationStatus).toHaveBeenCalledWith('test');
    expect(frames[0]).toMatchObject({ type: 'mcp.auth.status', payload: { authorized: true } });
    authorizationStatus.mockRejectedValue(new Error('unavailable'));
    await handleMcpAuthStatus(ws, message(), 'config.json', registry);
    expect(frames[1]?.payload).toMatchObject({
      success: false,
      message: 'MCP auth status failed: unavailable',
    });
  });

  it('reports an unwired registry without starting authorization', async () => {
    const { ws, frames } = socket();
    await handleMcpAuthLogin(ws, message(), 'config.json');
    expect(frames[0]?.payload.success).toBe(false);
  });

  it('filters and caps scopes and returns the pending authorization URL', async () => {
    const { ws, frames } = socket();
    const loginAuthorization = vi.fn().mockResolvedValue({
      started: {
        authorizationUrl: 'https://example.test/authorize',
        redirectUri: 'http://localhost/callback',
        scopes: ['read'],
      },
      completion: Promise.resolve(),
    });
    await handleMcpAuthLogin(
      ws,
      message({ name: 'test', clientId: 'client', scopes: ['', 12, ...Array(70).fill('read')] }),
      'config.json',
      { loginAuthorization } as unknown as MCPRegistry,
    );
    expect(loginAuthorization).toHaveBeenCalledWith('test', {
      clientId: 'client',
      scopes: Array(64).fill('read'),
    });
    expect(frames[0]).toMatchObject({
      type: 'mcp.auth.pending',
      payload: { name: 'test', authorizationUrl: 'https://example.test/authorize' },
    });
  });

  it('reports asynchronous authorization failures to the client', async () => {
    const { ws, frames } = socket();
    let reject!: (error: Error) => void;
    const completion = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const loginAuthorization = vi.fn().mockResolvedValue({ started: {}, completion });
    await handleMcpAuthLogin(
      ws,
      message({ name: 'test', clientId: 'x'.repeat(4097), scopes: [false] }),
      'config.json',
      { loginAuthorization } as unknown as MCPRegistry,
    );
    expect(loginAuthorization).toHaveBeenCalledWith('test', { clientId: undefined });
    reject(new Error('cancelled'));
    await completion.catch(() => undefined);
    expect(frames[1]?.payload).toMatchObject({
      success: false,
      message: 'MCP OAuth sign-in failed for "test": cancelled',
    });
  });

  it('honours a denying trust boundary before starting OAuth', async () => {
    const { ws, frames } = socket();
    const loginAuthorization = vi.fn();
    await handleMcpAuthLogin(
      ws,
      message(),
      'config.json',
      { loginAuthorization } as unknown as MCPRegistry,
      { evaluate: async () => ({ kind: 'deny', reason: 'denied', policyId: 'test' }) },
    );
    expect(loginAuthorization).not.toHaveBeenCalled();
    expect(frames[0]?.payload.success).toBe(false);
  });

  it.each([true, false])('reports logout when stored credentials exist: %s', async (removed) => {
    const { ws, frames } = socket();
    const disconnectAuthorization = vi.fn().mockResolvedValue(removed);
    await handleMcpAuthLogout(ws, message(), 'config.json', {
      disconnectAuthorization,
    } as unknown as MCPRegistry);
    expect(disconnectAuthorization).toHaveBeenCalledWith('test');
    expect(frames[0]?.payload).toMatchObject({
      success: true,
      message: removed
        ? 'Removed stored OAuth credentials for "test"'
        : 'No stored OAuth credentials for "test"',
    });
  });
});
