import { useCallback } from 'react';
import { mergeStatuslineHiddenItems } from './app-ui-state.js';
import type { StatuslineItem } from './components/statusline-picker.js';
import type { useAppEnvironment } from './hooks/use-app-environment.js';
import type { useAppRefSpine } from './hooks/use-app-ref-spine.js';
import type { useAppState } from './hooks/use-app-state.js';

/**
 * Statusline picker openers, seeded from the live layout (hidden items, lines, densities, order).
 */
export function useControllerStatuslinePicker({
  dispatch,
  spine,
  envResult,
}: {
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  spine: ReturnType<typeof useAppRefSpine>;
  envResult: ReturnType<typeof useAppEnvironment>;
}) {
  const { stateRef } = spine;
  const { hiddenItemsRef, linesRef, densitiesRef, orderRef } = envResult;
  const statuslineHiddenForPicker = useCallback((): StatuslineItem[] => {
    return mergeStatuslineHiddenItems(
      hiddenItemsRef.current,
      stateRef.current.statuslinePicker.hiddenItems,
    );
  }, [hiddenItemsRef, stateRef]);

  const openStatuslinePicker = useCallback(
    (field?: number) => {
      if (field !== undefined) {
        dispatch({ type: 'statuslineFieldSet', field });
      }
      // Seed the editor from the live layout so the picker opens showing what
      // the bar is actually rendering, not the contract defaults.
      dispatch({
        type: 'statuslineOpen',
        hiddenItems: statuslineHiddenForPicker(),
        lines: linesRef.current,
        densities: densitiesRef.current,
        order: orderRef.current,
      });
    },
    [dispatch, statuslineHiddenForPicker, linesRef, densitiesRef, orderRef],
  );
  return { statuslineHiddenForPicker, openStatuslinePicker };
}
