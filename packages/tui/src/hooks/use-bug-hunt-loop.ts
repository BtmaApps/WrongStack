import { useCallback, useEffect, useRef } from 'react';
import type { Action } from '../app-reducer.js';

type ActiveBugHunt = {
  command: string;
  commandName: string;
  label: string;
  scope?: string | undefined;
  totalRounds?: number | undefined;
  completedRounds: number;
};

const HUNT_COMMAND_META: Record<string, { commandName: string; label: string }> = {
  bughunt: { commandName: 'bughunt', label: 'Proof-Driven Bug Hunter' },
  sechunt: { commandName: 'sechunt', label: 'Proof-Driven Security Hardener' },
  secproof: { commandName: 'sechunt', label: 'Proof-Driven Security Hardener' },
  racehunt: { commandName: 'racehunt', label: 'Proof-Driven Race & Leak Hunter' },
  leakhunt: { commandName: 'racehunt', label: 'Proof-Driven Race & Leak Hunter' },
  flakehunt: { commandName: 'racehunt', label: 'Proof-Driven Race & Leak Hunter' },
  debloat: { commandName: 'debloat', label: 'Proof-Driven Dead-Code & Bloat Excisor' },
  deadcode: { commandName: 'debloat', label: 'Proof-Driven Dead-Code & Bloat Excisor' },
  excise: { commandName: 'debloat', label: 'Proof-Driven Dead-Code & Bloat Excisor' },
  uipolish: { commandName: 'uipolish', label: 'Proof-Driven UI & Accessibility Ratchet' },
  a11yhunt: { commandName: 'uipolish', label: 'Proof-Driven UI & Accessibility Ratchet' },
  uihunt: { commandName: 'uipolish', label: 'Proof-Driven UI & Accessibility Ratchet' },
  typehunt: { commandName: 'typehunt', label: 'Proof-Driven Type & Boundary Guard' },
  boundaryhunt: { commandName: 'typehunt', label: 'Proof-Driven Type & Boundary Guard' },
  testgap: { commandName: 'testgap', label: 'Proof-Driven Blind-Spot & Invariant Tester' },
  covhunt: { commandName: 'testgap', label: 'Proof-Driven Blind-Spot & Invariant Tester' },
  invarianthunt: { commandName: 'testgap', label: 'Proof-Driven Blind-Spot & Invariant Tester' },
};

function resolveHuntMeta(command: string): { commandName: string; label: string } {
  const token = command.trim().match(/^\/([a-z][\w-]*)/)?.[1] ?? 'bughunt';
  return HUNT_COMMAND_META[token] ?? { commandName: 'bughunt', label: 'Proof-Driven Bug Hunter' };
}

function buildRunningInfo(
  active: Pick<ActiveBugHunt, 'commandName' | 'label'>,
  currentRound: number,
  totalRounds?: number,
) {
  return {
    currentRound,
    totalRounds,
    ...(active.commandName !== 'bughunt'
      ? { commandName: active.commandName, label: active.label }
      : {}),
  };
}

function parseBugHuntScope(command: string): string | undefined {
  const args = command.replace(/^\/[a-z][\w-]*(?:\s+|$)/, '').trim();
  const match = args.match(/^--rounds(?:\s+|=)\d+(?:\s+([\s\S]*))?$/);
  const scope = (match?.[1] ?? (match ? '' : args)).trim();
  return scope || undefined;
}

function buildContinuationMessage(active: ActiveBugHunt): string {
  const round = active.completedRounds + 1;
  const roundLabel = active.totalRounds ? `round ${round}/${active.totalRounds}` : `round ${round}`;
  const scope = active.scope ? ` Stay within the original scope: ${active.scope}.` : '';
  return `This is ${roundLabel}; we're continuing the bug hunt.${scope}`;
}

/**
 * Let the just-finished run complete its `finally` cleanup before its successor
 * enters the normal submit path. In particular, `runBlocks` clears its active
 * controller only after it notifies this hook; submitting synchronously here
 * makes the next round look like mid-run input and can leave it queued.
 */
function submitAfterCurrentRun(submit: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(submit, 0);
}

/** Coordinates single-round or explicitly bounded `/bughunt` runs in the TUI. */
export function useBugHuntLoop(
  dispatch: (action: Action) => void,
  submit: (command: string) => void,
  historyGen?: number,
) {
  const activeRef = useRef<ActiveBugHunt | null>(null);
  const replayCommandRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSubmit = useCallback(() => {
    if (pendingSubmitRef.current !== null) clearTimeout(pendingSubmitRef.current);
    pendingSubmitRef.current = null;
    replayCommandRef.current = null;
  }, []);
  useEffect(() => cancelPendingSubmit, [cancelPendingSubmit]);

  // /clear (and any wholesale history replacement, e.g. /resume) ends any
  // hunt. The reducer half (bugHuntRunning / bugHuntContinue) is reset by the
  // 'clearHistory' case, but this hook's refs live OUTSIDE the reducer: a
  // mid-round /clear bumps sessionGeneration, so run-blocks-controller drops
  // the in-flight run BEFORE onRunFinished fires — without this effect
  // nothing would ever clear them. shouldSuppressNextSteps() would stay true
  // for the rest of the process (silently disabling next-steps suggestions
  // and predictions), and a stale replay marker could swallow the echo of the
  // user's next identical command. Reacting to the history generation App
  // already tracks needs no new wiring beyond passing it in.
  const lastHistoryGenRef = useRef(historyGen);
  useEffect(() => {
    if (historyGen === undefined) return;
    if (historyGen === lastHistoryGenRef.current) return;
    lastHistoryGenRef.current = historyGen;
    cancelPendingSubmit();
    activeRef.current = null;
    replayCommandRef.current = null;
  }, [historyGen, cancelPendingSubmit]);

  const onBugHuntStarted = useCallback(
    (command: string, totalRounds?: number) => {
      const active = activeRef.current;
      if (active?.command === command) {
        dispatch({
          type: 'bugHuntRunningOpen',
          info: buildRunningInfo(active, active.completedRounds + 1, active.totalRounds),
        });
        return;
      }
      cancelPendingSubmit();
      const meta = resolveHuntMeta(command);
      const nextActive: ActiveBugHunt = {
        command,
        commandName: meta.commandName,
        label: meta.label,
        scope: parseBugHuntScope(command),
        totalRounds,
        completedRounds: 0,
      };
      activeRef.current = nextActive;
      dispatch({
        type: 'bugHuntRunningOpen',
        info: buildRunningInfo(nextActive, 1, totalRounds),
      });
    },
    [dispatch, cancelPendingSubmit],
  );

  const onRunFinished = useCallback(
    (status: 'done' | 'aborted' | 'failed' | 'max_iterations') => {
      const active = activeRef.current;
      if (!active) return;
      if (status === 'done' && pendingSubmitRef.current !== null) return;
      dispatch({ type: 'bugHuntRunningClose' });
      if (status !== 'done') {
        cancelPendingSubmit();
        activeRef.current = null;
        dispatch({
          type: 'addEntry',
          entry: {
            kind: 'info',
            text: `${active.label} loop stopped because this round did not complete.`,
          },
        });
        return;
      }
      active.completedRounds++;
      const requestedRounds = active.totalRounds ?? 1;
      if (active.completedRounds >= requestedRounds) {
        activeRef.current = null;
        dispatch({
          type: 'addEntry',
          entry: {
            kind: 'info',
            text:
              active.totalRounds === undefined
                ? `${active.label} completed its single round.`
                : `${active.label} completed ${active.completedRounds}/${active.totalRounds} requested rounds.`,
          },
        });
        return;
      }
      const snapshot = { ...active };
      const continueWithNextRound = () => {
        // Round 1 is the slash command that expands the full prompt. Later
        // rounds submit only a compact reminder, directly through the normal
        // submit path. It must not be placed in the composer for the user to
        // press Enter again.
        const continuation = buildContinuationMessage(snapshot);
        dispatch({
          type: 'bugHuntRunningOpen',
          info: buildRunningInfo(snapshot, snapshot.completedRounds + 1, snapshot.totalRounds),
        });
        pendingSubmitRef.current = submitAfterCurrentRun(() => {
          pendingSubmitRef.current = null;
          if (activeRef.current !== active) return;
          replayCommandRef.current = continuation;
          submit(continuation);
        });
      };

      // Only an explicit --rounds budget reaches this branch. Continue as
      // soon as the previous round succeeds; plain /bughunt is single-shot.
      continueWithNextRound();
    },
    [dispatch, submit, cancelPendingSubmit],
  );

  const consumeReplay = useCallback((command: string): boolean => {
    if (replayCommandRef.current !== command) return false;
    replayCommandRef.current = null;
    return true;
  }, []);

  const stopAfterCurrentRound = useCallback(() => {
    const active = activeRef.current;
    if (!active) {
      dispatch({
        type: 'addEntry',
        entry: { kind: 'info', text: 'No active Proof-Driven Bug Hunter run to stop.' },
      });
      return;
    }
    // Between rounds there is no work left to finish. Cancel the deferred
    // submission before it can start another round.
    if (pendingSubmitRef.current !== null) {
      cancelPendingSubmit();
      activeRef.current = null;
      dispatch({ type: 'bugHuntRunningClose' });
      dispatch({
        type: 'addEntry',
        entry: {
          kind: 'info',
          text: `${active.label} stopped after ${active.completedRounds} completed rounds.`,
        },
      });
      return;
    }
    // Reuse the normal completion check without interrupting the running round.
    const currentRound = active.completedRounds + 1;
    active.totalRounds = currentRound;
    dispatch({
      type: 'bugHuntRunningOpen',
      info: buildRunningInfo(active, currentRound, currentRound),
    });
    dispatch({
      type: 'addEntry',
      entry: {
        kind: 'info',
        text: `${active.label} will stop after round ${currentRound} completes.`,
      },
    });
  }, [dispatch, cancelPendingSubmit]);

  const shouldSuppressNextSteps = useCallback(() => activeRef.current !== null, []);

  return {
    onBugHuntStarted,
    onRunFinished,
    consumeReplay,
    stopAfterCurrentRound,
    shouldSuppressNextSteps,
  };
}
