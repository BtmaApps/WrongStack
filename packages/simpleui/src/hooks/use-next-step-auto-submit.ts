import { createAutoProceedLoopGuard } from '@wrongstack/tools/auto-proceed-loop-guard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectAssistantMessage } from '../lib/message-projection.js';
import type { ChatMessage } from '../types.js';

/** Fallback and bounds for the countdown, mirroring VibeUI. */
const DEFAULT_DELAY_MS = 15_000;
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 300_000;

export interface NextStepAutoCountdown {
  messageId: string;
  /** `index` of the suggestion that will be sent. */
  stepIndex: number;
  remaining: number;
}

export type NextStepAutoPause = 'cap' | 'loop';

interface UseNextStepAutoSubmitOptions {
  sessionId: string | null;
  messages: readonly ChatMessage[];
  running: boolean;
  /** Message ids whose suggestions were already used (clicked or auto-run). */
  consumed: ReadonlySet<string>;
  markConsumed: (messageId: string) => void;
  autonomy: string;
  yolo: boolean;
  delayMs: number;
  /** Consecutive automatic submissions allowed before pausing. 0 = unlimited. */
  maxIterations: number;
  hasDraft: boolean;
  queuedCount: number;
  /** A modal/confirmation/refine round is waiting on the user. */
  blocked: boolean;
  connected: boolean;
  /** Send the text as a user message. Returns false when nothing was sent. */
  submit: (text: string) => boolean;
  onPaused: (reason: NextStepAutoPause) => void;
}

interface SessionAutoState {
  sessionId: string | null;
  streak: number;
  guard: ReturnType<typeof createAutoProceedLoopGuard>;
  pausedFor: string | null;
}

/**
 * Next-step auto-submit for SimpleUI.
 *
 * With autonomy `auto` AND YOLO (the server folds YOLO+ into `yolo`), the
 * suggestions panel of a run THIS client started and that ended `done` counts
 * down and then sends one suggestion: the model's `auto="true"` pick when it
 * made one, else the first. The marker is optional model output and must not
 * decide whether auto mode runs.
 *
 * Guardrails (the autonomy mode itself is never touched):
 *  - only a live, locally owned, `done` run arms it (`message.autoEligible`);
 *  - typing a draft, queued messages, an open confirmation/refine round or a
 *    dropped connection stop it; typing also resets the consecutive streak;
 *  - `autoProceedMaxIterations` caps consecutive automatic sends;
 *  - the shared repetition guard halts a prompt loop.
 */
export function useNextStepAutoSubmit(options: UseNextStepAutoSubmitOptions): {
  countdown: NextStepAutoCountdown | null;
  cancel: () => void;
} {
  const {
    sessionId,
    messages,
    running,
    consumed,
    autonomy,
    yolo,
    delayMs,
    maxIterations,
    hasDraft,
    queuedCount,
    blocked,
    connected,
    onPaused,
  } = options;

  const stateRef = useRef<SessionAutoState>({
    sessionId,
    streak: 0,
    guard: createAutoProceedLoopGuard(),
    pausedFor: null,
  });
  if (stateRef.current.sessionId !== sessionId) {
    stateRef.current = {
      sessionId,
      streak: 0,
      guard: createAutoProceedLoopGuard(),
      pausedFor: null,
    };
  }
  const [cancelledId, setCancelledId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const latest = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant') return message;
    }
    return undefined;
  }, [messages]);

  const target = useMemo(() => {
    if (latest?.autoEligible !== true || latest.final !== true || latest.streaming) {
      return null;
    }
    if (consumed.has(latest.id)) return null;
    const steps = latest.nextSteps ?? projectAssistantMessage(latest.text).nextSteps;
    const step = steps.find((candidate) => candidate.auto) ?? steps[0];
    return step ? { id: latest.id, index: step.index, text: step.text } : null;
  }, [latest, consumed]);

  // Manual input ends the auto streak and cancels the pending countdown.
  useEffect(() => {
    if (!hasDraft) return;
    stateRef.current.streak = 0;
    stateRef.current.guard.reset();
    if (target) setCancelledId(target.id);
  }, [hasDraft, target]);

  const capReached = maxIterations > 0 && stateRef.current.streak >= maxIterations;
  const gateOpen =
    autonomy === 'auto' &&
    yolo &&
    connected &&
    !running &&
    !hasDraft &&
    !blocked &&
    queuedCount === 0 &&
    !capReached;

  const targetId = target?.id ?? null;
  useEffect(() => {
    if (!targetId || !capReached || autonomy !== 'auto' || !yolo) return;
    if (stateRef.current.pausedFor === targetId) return;
    stateRef.current.pausedFor = targetId;
    onPaused('cap');
  }, [targetId, capReached, autonomy, yolo, onPaused]);

  // The fire site re-reads everything through this ref: the timer outlives the
  // render that armed it.
  const live = useRef({ ...options, gateOpen, target });
  live.current = { ...options, gateOpen, target };

  const targetText = target?.text ?? null;
  useEffect(() => {
    if (!targetId || targetText === null || !gateOpen || cancelledId === targetId) {
      setRemaining(null);
      return;
    }
    const delay = Math.max(
      MIN_DELAY_MS,
      Math.min(MAX_DELAY_MS, Number.isFinite(delayMs) && delayMs > 0 ? delayMs : DEFAULT_DELAY_MS),
    );
    const deadline = Date.now() + delay;
    setRemaining(Math.ceil(delay / 1000));
    const interval = setInterval(
      () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    );
    const timer = setTimeout(() => {
      const current = live.current;
      if (!current.gateOpen || current.target?.id !== targetId) return;
      const state = stateRef.current;
      if (!state.guard.record(targetText).shouldHalt) {
        if (current.submit(targetText)) {
          state.streak += 1;
          current.markConsumed(targetId);
        } else {
          setCancelledId(targetId);
        }
      } else {
        setCancelledId(targetId);
        current.onPaused('loop');
      }
      setRemaining(null);
    }, delay);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [targetId, targetText, gateOpen, cancelledId, delayMs]);

  const cancel = useCallback(() => {
    if (targetId) setCancelledId(targetId);
    setRemaining(null);
  }, [targetId]);

  const countdown =
    target && remaining !== null
      ? { messageId: target.id, stepIndex: target.index, remaining }
      : null;
  return { countdown, cancel };
}
