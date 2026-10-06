import type { Director } from '@wrongstack/core/coordination';
import type { resolveControllerProps } from './controller-props.js';
import type { useAppEnvironment } from './hooks/use-app-environment.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';
import { useDirectorFleetBridge } from './hooks/use-director-fleet-bridge.js';
import { useExitCommand } from './hooks/use-exit-command.js';
import { useSessionInterruptController } from './hooks/use-session-interrupt-controller.js';
import { useTuiControllers } from './hooks/use-tui-controllers.js';
import { useTuiEventBridge } from './hooks/use-tui-event-bridge.js';

/**
 * Event bus, controller, interrupt, /exit and director-fleet bridges for the live session. Hook order is fixed.
 */
export function useControllerSessionBridges({
  controllerProps,
  dispatch,
  getActiveSessionId,
  state,
  clearPendingConfirms,
  liveDirector,
  spine,
  envResult,
}: {
  controllerProps: ReturnType<typeof resolveControllerProps>;
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  getActiveSessionId: () => string;
  state: ReturnType<typeof useAppState>['state'];
  clearPendingConfirms: () => void;
  liveDirector: () => Director | null;
  spine: ReturnType<typeof useAppRefSpine>;
  envResult: ReturnType<typeof useAppEnvironment>;
}) {
  const {
    stateRef,
    sessionGenerationRef,
    activeCtrlRef,
    activeRunSettledRef,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    assistantCommittedThisRunRef,
    flushTimerRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    tokenPreviewsRef,
  } = spine;
  const { setActiveMaxContext } = envResult.environment;
  useTuiEventBridge({
    events: controllerProps.events,
    dispatch,
    stateRef,
    setActiveMaxContext,
    getSessionId: getActiveSessionId,
    subscribeGoal: controllerProps.subscribeGoal,
    onClearHistory: controllerProps.onClearHistory,
    sessionGenerationRef,
  });

  useTuiControllers({
    dispatch,
    fleetChat: state.fleetChat,
    enhanceEnabled: state.enhanceEnabled,
    agentsMonitorOpen: state.agentsMonitorOpen,
    fleetStreamController: controllerProps.fleetStreamController,
    enhanceController: controllerProps.enhanceController,
    agentsMonitorController: controllerProps.agentsMonitorController,
  });

  useSessionInterruptController({
    interruptController: controllerProps.interruptController,
    dispatch,
    stateRef,
    activeCtrlRef,
    activeRunSettledRef,
    sessionGenerationRef,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    assistantCommittedThisRunRef,
    flushTimerRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    tokenPreviewsRef,
    clearPendingConfirms,
    getEternalEngine: controllerProps.getEternalEngine,
    getParallelEngine: controllerProps.getParallelEngine,
    getSddRun: controllerProps.getSddRun,
    switchAutonomy: controllerProps.switchAutonomy,
  });

  useExitCommand({
    slashRegistry: controllerProps.slashRegistry,
    dispatch,
    exitConfirm: state.exitConfirm,
    stateRef,
    sessionGenerationRef,
    interruptController: controllerProps.interruptController,
    getDirector: liveDirector,
  });

  useDirectorFleetBridge({
    director: controllerProps.director,
    dispatch,
    stateRef,
    chatMode: state.fleetChat,
    sessionGenerationRef,
  });
}
