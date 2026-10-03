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

export type UserInstructionsPayload =
  | (UserInstructionsDocument & { saved?: boolean })
  | { error: string };

export async function handleUserInstructions(
  ws: WebSocket,
  action: 'get' | 'save',
  payload: Record<string, unknown>,
  send: (ws: WebSocket, message: WSServerMessage) => void,
): Promise<void> {
  let reply: UserInstructionsPayload;
  try {
    if (action === 'get') {
      reply = await readUserInstructions();
    } else {
      const text = payload['text'];
      const base = payload['baseMtimeMs'];
      if (typeof text !== 'string') throw new Error('Invalid instructions text.');
      if (base !== null && typeof base !== 'number')
        throw new Error('Invalid instructions revision.');
      reply = { ...(await writeUserInstructions(text, base)), saved: true };
    }
  } catch (error) {
    reply = { error: toErrorMessage(error) };
  }
  send(ws, { type: 'user_instructions', payload: reply });
}
