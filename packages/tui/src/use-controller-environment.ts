import type { AppProps } from './app-props.js';
import type { resolveControllerProps } from './controller-props.js';
import { useAppEnvironment } from './hooks/use-app-environment.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';
import type { useStdout } from './ink.js';
import type { useControllerPanelHooks } from './use-controller-panel-hooks.js';

/**
 * Environment facade (`useAppEnvironment`) wired from controller props + the ref spine.
 */
export function useControllerEnvironment({
  controllerProps,
  state,
  dispatch,
  mailbox,
  stdout,
  props,
  spine,
}: {
  controllerProps: ReturnType<typeof resolveControllerProps>;
  state: ReturnType<typeof useAppState>['state'];
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  mailbox: ReturnType<typeof useControllerPanelHooks>['mailbox'];
  stdout: ReturnType<typeof useStdout>['stdout'];
  props: AppProps;
  spine: ReturnType<typeof useAppRefSpine>;
}) {
  const { stateRef, builderRef, eternalLoopRunningRef, parallelLoopRunningRef } = spine;
  const envResult = useAppEnvironment({
    agent: controllerProps.agent,
    attachments: controllerProps.attachments,
    configStore: controllerProps.configStore,
    state,
    dispatch,
    mailboxPanelOpen: mailbox.mailboxPanelOpen,
    stdout,
    events: controllerProps.events,
    memoryStore: controllerProps.memoryStore,
    model: controllerProps.model,
    provider: controllerProps.provider,
    effectiveMaxContext: controllerProps.effectiveMaxContext,
    yolo: controllerProps.yolo,
    mouse: controllerProps.mouse,
    capability: controllerProps.capability,
    chime: controllerProps.chime,
    confirmExit: controllerProps.confirmExit,
    stateRef,
    builderRef,
    eternalLoopRunningRef,
    parallelLoopRunningRef,
    getAutonomy: controllerProps.getAutonomy,
    modeLabel: controllerProps.modeLabel,
    statuslineHiddenItems: controllerProps.statuslineHiddenItems,
    toolCount: controllerProps.toolCount,
    getSettings: controllerProps.getSettings,
    setStatuslineHiddenItems: controllerProps.setStatuslineHiddenItems,
    saveStatuslineHiddenItems: controllerProps.saveStatuslineHiddenItems,
    statuslineLines: controllerProps.statuslineLines,
    setStatuslineLines: controllerProps.setStatuslineLines,
    saveStatuslineLines: controllerProps.saveStatuslineLines,
    statuslineDensities: controllerProps.statuslineDensities,
    setStatuslineDensities: controllerProps.setStatuslineDensities,
    saveStatuslineDensities: controllerProps.saveStatuslineDensities,
    statuslineOrder: controllerProps.statuslineOrder,
    setStatuslineOrder: controllerProps.setStatuslineOrder,
    saveStatuslineOrder: controllerProps.saveStatuslineOrder,
    titleController: controllerProps.titleController,
    getYolo: props.getYolo,
    getModeLabel: controllerProps.getModeLabel,
    getEternalEngine: controllerProps.getEternalEngine,
    getParallelEngine: controllerProps.getParallelEngine,
    switchAutonomy: controllerProps.switchAutonomy,
    subscribeEternalIteration: props.subscribeEternalIteration,
    subscribeEternalStage: props.subscribeEternalStage,
    getLiveSessions: controllerProps.getLiveSessions,
    saveSettings: controllerProps.saveSettings,
  });
  return envResult;
}
