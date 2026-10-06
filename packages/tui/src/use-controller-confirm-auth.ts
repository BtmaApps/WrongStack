import type { Director } from '@wrongstack/core/coordination';
import { useCallback, useEffect } from 'react';
import type { resolveControllerProps } from './controller-props.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';
import { useAuthPanel } from './hooks/use-auth-panel.js';

/**
 * Live director resolver, pending-confirm teardown, and the auth panel (which also serves the secret-input prompt).
 */
export function useControllerConfirmAuth({
  getDirector,
  controllerProps,
  dispatch,
  state,
  secretInputController,
  spine,
}: {
  getDirector: ReturnType<typeof resolveControllerProps>['getDirector'];
  controllerProps: ReturnType<typeof resolveControllerProps>;
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  state: ReturnType<typeof useAppState>['state'];
  secretInputController: ReturnType<typeof resolveControllerProps>['secretInputController'];
  spine: ReturnType<typeof useAppRefSpine>;
}) {
  const { stateRef } = spine;
  const liveDirector = useCallback(
    (): Director | null => getDirector?.() ?? controllerProps.director,
    [getDirector, controllerProps.director],
  );

  const clearPendingConfirms = useCallback(() => {
    const queue = stateRef.current.confirmQueue;
    if (queue.length === 0) return;
    for (const c of queue) {
      try {
        c.resolve('no');
      } catch {
        // already settled
      }
    }
    dispatch({ type: 'confirmClearAll' });
  }, [dispatch, stateRef]);

  const authPanelController = useAuthPanel({
    authHost: controllerProps.authHost,
    stateRef,
    dispatch,
    open: state.authPanel.open,
  });

  useEffect(() => {
    if (!secretInputController) return;
    const previousSecret = secretInputController.readSecret;
    const previousText = secretInputController.readText;
    secretInputController.readSecret = authPanelController.readSecret;
    secretInputController.readText = authPanelController.readText;
    return () => {
      secretInputController.readSecret = previousSecret;
      if (previousText) secretInputController.readText = previousText;
      else delete secretInputController.readText;
    };
  }, [secretInputController, authPanelController.readSecret, authPanelController.readText]);
  return { liveDirector, clearPendingConfirms, authPanelController };
}
