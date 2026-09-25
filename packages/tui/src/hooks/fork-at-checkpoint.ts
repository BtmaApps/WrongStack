import { toErrorMessage } from '@wrongstack/core/utils';
import type { Action } from '../app-action-type.js';
import { restoreRewoundPrompt } from '../rewind-prompt.js';

export interface ForkAtCheckpointDeps {
  /** Host fork: branches `sessionId` at the checkpoint and returns the new id. */
  forkSession: (sessionId: string, checkpointPromptIndex: number) => Promise<{ id: string }>;
  /** The prompt recorded for the checkpoint (see `DefaultSessionRewinder.promptAt`). */
  promptAt: (sessionId: string, checkpointPromptIndex: number) => Promise<string | undefined>;
  /** The resume flow the /resume picker runs. */
  resume: (sessionId: string, label: string) => Promise<void>;
  /** The session the agent is on now; tells whether the resume attached the fork. */
  currentSessionId: () => string | undefined;
  dispatch: (action: Action) => void;
}

/**
 * Fork the current session at a checkpoint and switch to the fork: the
 * conversation up to that prompt continues in a new session, the original
 * stays as it was, and the prompt is back in the composer to edit and send.
 */
export async function forkAtCheckpoint(
  deps: ForkAtCheckpointDeps,
  request: { sessionId: string; promptIndex: number; draft: string },
): Promise<void> {
  const { dispatch } = deps;
  let forkId: string;
  let promptText: string | undefined;
  try {
    promptText = await deps.promptAt(request.sessionId, request.promptIndex).catch(() => undefined);
    forkId = (await deps.forkSession(request.sessionId, request.promptIndex)).id;
  } catch (err) {
    dispatch({
      type: 'addEntry',
      entry: { kind: 'error', text: `Fork failed: ${toErrorMessage(err)}` },
    });
    return;
  }
  await deps.resume(forkId, `fork of ${request.sessionId} at #${request.promptIndex}`);
  // The resume reports its own failure; the prompt goes back only into the fork.
  if (deps.currentSessionId() !== forkId) return;
  dispatch({
    type: 'addEntry',
    entry: {
      kind: 'info',
      text: `Forked at checkpoint #${request.promptIndex} into ${forkId}. ${request.sessionId} is unchanged; the working tree is shared.`,
    },
  });
  restoreRewoundPrompt(dispatch, request.draft, promptText);
}
