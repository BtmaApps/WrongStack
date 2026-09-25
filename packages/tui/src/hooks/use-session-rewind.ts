import type { Agent } from '@wrongstack/core/agent';
import type { Director } from '@wrongstack/core/coordination';
import {
  applyRewindToConversation,
  DefaultSessionRewinder,
  type RedoRewindResult,
  type RewoundConversation,
  redoLastRewind,
} from '@wrongstack/core/storage';
import { useCallback } from 'react';
import type { SessionInterruptController } from './use-session-interrupt-controller.js';

/** What a rewind leaves for the screen: the prompt taken back, and the rest. */
export interface RewindOutcome {
  promptText?: string | undefined;
  conversation?: RewoundConversation | undefined;
}

interface UseSessionRewindOptions {
  agent: Agent;
  sessionsDir?: string | undefined;
  interruptController?: SessionInterruptController | undefined;
  liveDirector: () => Director | null;
  sessionGenerationRef: React.MutableRefObject<number>;
}

export function useSessionRewind({
  agent,
  sessionsDir,
  interruptController,
  liveDirector,
  sessionGenerationRef,
}: UseSessionRewindOptions) {
  // Invalidate late output before stopping every producer that can mutate
  // the session: the foreground leader, autonomy/SDD drivers, and fleet.
  // Rewind and redo both rewrite the journal, so neither may race a turn.
  const stopSessionProducers = useCallback(async () => {
    sessionGenerationRef.current++;
    interruptController?.abortLeader();

    const cleanup: Promise<unknown>[] = [];
    if (interruptController?.waitForIdle) {
      cleanup.push(interruptController.waitForIdle().catch(() => undefined));
    }
    const rewindDir = liveDirector();
    if (rewindDir) cleanup.push(rewindDir.terminateAll().catch(() => undefined));

    if (cleanup.length > 0) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 1500);
        timeout.unref?.();
      });
      try {
        await Promise.race([Promise.allSettled(cleanup).then(() => undefined), cap]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
  }, [interruptController, liveDirector, sessionGenerationRef]);

  /**
   * Rewind to a checkpoint. Resolves with the text of the prompt it took back
   * and the conversation as it now stands.
   */
  const handleRewindTo = useCallback(
    async (checkpointIndex: number): Promise<RewindOutcome> => {
      const sessionId = agent.ctx.session.id;
      if (!sessionId) return {};
      await stopSessionProducers();

      const rewinder = new DefaultSessionRewinder(
        sessionsDir ?? '',
        agent.ctx.projectRoot ?? agent.ctx.cwd,
      );
      const reverted = await rewinder.rewindToCheckpoint(sessionId, checkpointIndex);
      const applied = await applyRewindToConversation({
        session: agent.ctx.session,
        state: agent.ctx.state,
        sessionsDir: sessionsDir ?? '',
        promptIndex: checkpointIndex,
        revertedFiles: reverted.revertedFiles,
        meta: agent.ctx.meta,
      });
      return { promptText: reverted.promptText, conversation: applied.conversation };
    },
    [
      agent.ctx.session,
      agent.ctx.meta,
      sessionsDir,
      agent.ctx.projectRoot,
      agent.ctx.cwd,
      stopSessionProducers,
    ],
  );

  /** `/rewind redo`: undo the newest rewind (null when there is none). */
  const handleRewindRedo = useCallback(async (): Promise<RedoRewindResult | null> => {
    if (!agent.ctx.session.id) return null;
    // "Nothing to redo" must not abort a running turn: only stop the
    // producers once there is a rewind to undo.
    if (!(await agent.ctx.session.peekRedo?.())) return null;
    await stopSessionProducers();
    return redoLastRewind({
      session: agent.ctx.session,
      state: agent.ctx.state,
      sessionsDir: sessionsDir ?? '',
      projectRoot: agent.ctx.projectRoot ?? agent.ctx.cwd,
      meta: agent.ctx.meta,
    });
  }, [agent.ctx, sessionsDir, stopSessionProducers]);

  return { handleRewindTo, handleRewindRedo };
}
