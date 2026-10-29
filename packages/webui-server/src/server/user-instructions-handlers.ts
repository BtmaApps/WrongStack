// `~/.wrongstack/AGENTS.md` editor — the user's own rules for every project.
// The system prompt builder re-reads the file by mtime on each build, so a save
// applies from the next turn without any runtime hook.

import {
  readUserInstructions,
  type UserInstructionsDocument,
  writeUserInstructions,
} from '@wrongstack/core/agent';
import { toErrorMessage } from '@wrongstack/core/utils';
import type { WebSocket } from 'ws';
import type { WSServerMessage } from './types.js';
import { withRequestId } from './ws-utils.js';

export type UserInstructionsPayload =
  | ((UserInstructionsDocument & { saved?: boolean; includeGlobalAgents?: boolean }) & {
      requestId?: string;
    })
  | { error: string; requestId?: string };

export async function handleUserInstructions(
  ws: WebSocket,
  action: 'get' | 'save',
  payload: Record<string, unknown>,
  send: (ws: WebSocket, message: WSServerMessage) => void,
  configStore?: { get(): unknown; update(patch: Record<string, unknown>): void } | undefined,
  /**
   * Canonical prefs application path (`PrefsHandlerContext.applyConfigPrefs`).
   * Preferred over the raw `configStore` write: it routes the toggle through
   * `computeConfigPrefUpdates` and, on the standalone host, the same durable
   * config.json write the rest of the settings pane uses (Chimera finding 1).
   */
  applyPrefs?: ((payload: Record<string, unknown>) => void) | undefined,
): Promise<void> {
  let reply: UserInstructionsPayload;
  try {
    const readInclude = (): boolean | undefined =>
      (configStore?.get() as { systemPrompt?: { includeGlobalAgents?: boolean } } | undefined)
        ?.systemPrompt?.includeGlobalAgents;
    if (action === 'get') {
      const doc = await readUserInstructions();
      reply = { ...doc, includeGlobalAgents: readInclude() ?? true };
    } else {
      const text = payload['text'];
      const base = payload['baseMtimeMs'];
      if (typeof text !== 'string') throw new Error('Invalid instructions text.');
      if (base !== null && typeof base !== 'number')
        throw new Error('Invalid instructions revision.');
      const savedDoc = await writeUserInstructions(text, base);
      // Only after the file write is accepted: a stale-revision rejection
      // must not have already flipped the persisted toggle (Chimera finding).
      if (typeof payload['includeGlobalAgents'] === 'boolean') {
        const include = payload['includeGlobalAgents'];
        if (applyPrefs) {
          applyPrefs({ includeGlobalAgents: include });
        }
        // Mirror into the ConfigStore — the holder `readInclude()` reads (and
        // the one the CLI/TUI settings adapter reads). `applyPrefs` writes the
        // RUNTIME config object only (`state.setConfig`), a different holder
        // than the store, so without this the reply and every later read
        // reported the pre-toggle value.
        if (configStore?.update) {
          configStore.update({
            systemPrompt: {
              ...((configStore.get() as { systemPrompt?: Record<string, unknown> }).systemPrompt ??
                {}),
              includeGlobalAgents: include,
            },
          });
        }
      }
      reply = {
        ...savedDoc,
        saved: true,
        // Echo what the store holds AFTER the update (Chimera finding 3):
        // the effective value, not a parrot of the request payload.
        includeGlobalAgents: readInclude() ?? true,
      };
    }
  } catch (error) {
    reply = { error: toErrorMessage(error) };
  }
  send(ws, {
    type: 'user_instructions',
    payload: withRequestId({ payload }, { ...reply }) as UserInstructionsPayload,
  });
}
