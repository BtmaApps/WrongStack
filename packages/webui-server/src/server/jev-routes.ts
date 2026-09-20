import type { ConfigStore, SecretVault } from '@wrongstack/core/types';
import {
  jevActivitySnapshot,
  jevSettingsSnapshot,
  saveJevSettings,
  testJevConnection,
} from '@wrongstack/core/typesafe';
import type { WebSocket } from 'ws';
import type { WSClientMessage, WSServerMessage } from './types.js';

export interface JevRouteContext {
  store: ConfigStore | undefined;
  file: string;
  vault: SecretVault | undefined;
  send: (ws: WebSocket, message: WSServerMessage) => void;
}

export async function handleJevRoute(
  ctx: JevRouteContext,
  ws: WebSocket,
  msg: WSClientMessage,
): Promise<boolean> {
  if (!['jev.get', 'jev.set', 'jev.test'].includes(msg.type)) return false;
  const p = msg.payload as { requestId?: unknown; patch?: unknown } | undefined;
  const requestId = typeof p?.requestId === 'string' ? p.requestId.slice(0, 100) : undefined;
  if (!ctx.store) {
    ctx.send(ws, {
      type: 'jev.state',
      payload: { requestId, error: 'Jev settings unavailable on this host' },
    });
    return true;
  }
  let error: string | undefined;
  let message: string | undefined;
  try {
    if (msg.type === 'jev.set') {
      await saveJevSettings(ctx.store, ctx.file, ctx.vault, p?.patch);
      message = 'Saved. Restart existing sessions to apply all Jev consumers.';
    }
    if (msg.type === 'jev.test') message = await testJevConnection(ctx.store.get());
  } catch {
    // Provider errors may echo request content or headers. Never put them on the wire.
    error =
      msg.type === 'jev.test'
        ? 'Connection test failed. Check account settings and the activity log.'
        : 'Could not save Jev settings. Check field values, custom endpoint and profile file permissions.';
  }
  ctx.send(ws, {
    type: 'jev.state',
    payload: {
      requestId,
      settings: jevSettingsSnapshot(ctx.store.get()),
      activity: jevActivitySnapshot(),
      error,
      message,
    },
  });
  return true;
}
