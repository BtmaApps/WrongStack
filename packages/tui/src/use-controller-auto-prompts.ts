import type { AppProps } from './app-props.js';
import type { resolveControllerProps } from './controller-props.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';
import { useInitialPrompt } from './hooks/use-initial-prompt.js';
import { useLeaderAutoWake } from './hooks/use-leader-auto-wake.js';

/**
 * Prompts the controller starts on its own: leader auto-wake on delegate completion and the initial --goal / --ask prompt.
 */
export function useControllerAutoPrompts({
  props,
  controllerProps,
  dispatch,
  spine,
}: {
  props: AppProps;
  controllerProps: ReturnType<typeof resolveControllerProps>;
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  spine: ReturnType<typeof useAppRefSpine>;
}) {
  const {
    activeCtrlRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    enhanceAbortRef,
    stateRef,
    runBlocksRef,
    builderRef,
  } = spine;
  useLeaderAutoWake({
    leaderAutoWake: props.leaderAutoWake,
    events: controllerProps.events,
    dispatch,
    getSessionId: () => controllerProps.agent.ctx.session?.id,
    activeController: activeCtrlRef,
    eternalLoopRunning: eternalLoopRunningRef,
    parallelLoopRunning: parallelLoopRunningRef,
    enhanceAbort: enhanceAbortRef,
    state: stateRef,
    runBlocks: runBlocksRef,
  });

  useInitialPrompt({
    initialGoal: controllerProps.initialGoal,
    initialAsk: controllerProps.initialAsk,
    builderRef,
    runBlocksRef,
    dispatch,
  });
}
