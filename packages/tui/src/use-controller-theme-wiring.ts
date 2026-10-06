import type { AppProps } from './app-props.js';
import type { resolveControllerProps } from './controller-props.js';
import type { useAppEnvironment } from './hooks/use-app-environment.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';
import type { usePanelControllers } from './hooks/use-panel-controllers.js';
import type { useControllerPanelHooks } from './use-controller-panel-hooks.js';
import { useControllerThemeEvents } from './use-controller-theme-events.js';

/**
 * Feeds the controller theme/event hook from the ref spine, environment and panel facades.
 */
export function useControllerThemeEventWiring({
  dispatch,
  controllerProps,
  props,
  openModelPicker,
  openFKeyPicker,
  projectRoot,
  openSettings,
  state,
  openStatuslinePicker,
  spine,
  envResult,
  panelHooks,
}: {
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  controllerProps: ReturnType<typeof resolveControllerProps>;
  props: AppProps;
  openModelPicker: ReturnType<typeof usePanelControllers>['openModelPicker'];
  openFKeyPicker: ReturnType<typeof usePanelControllers>['openFKeyPicker'];
  projectRoot: string;
  openSettings: ReturnType<typeof usePanelControllers>['openSettings'];
  state: ReturnType<typeof useAppState>['state'];
  openStatuslinePicker: (field?: number) => void;
  spine: ReturnType<typeof useAppRefSpine>;
  envResult: ReturnType<typeof useAppEnvironment>;
  panelHooks: ReturnType<typeof useControllerPanelHooks>;
}) {
  const {
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    flushTimerRef,
    sessionGenerationRef,
    activeRunGenerationRef,
    assistantCommittedThisRunRef,
  } = spine;
  const { setHiddenItems, hiddenItemsRef, setMemoryContextMonitor } = envResult;
  const { setMailboxPanelOpen, openPromptPicker } = panelHooks;
  useControllerThemeEvents({
    dispatch,
    controllerProps,
    props,
    openModelPicker,
    openFKeyPicker,
    projectRoot,
    openSettings,
    state,
    openStatuslinePicker,
    setHiddenItems,
    hiddenItemsRef,
    setMailboxPanelOpen,
    openPromptPicker,
    streamingTextRef,
    streamSegmentsRef,
    pendingDeltaRef,
    flushTimerRef,
    sessionGenerationRef,
    activeRunGenerationRef,
    assistantCommittedThisRunRef,
    setMemoryContextMonitor,
  });
}
