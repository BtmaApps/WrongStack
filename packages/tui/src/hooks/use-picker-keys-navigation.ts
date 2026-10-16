import type { KeyEvent } from '../components/input.js';
import type { PickerKeysHost } from './use-picker-keys-types.js';

/**
 * Keys for the navigation pickers — project, sessions panel, slash, F-key and
 * the general picker. Tried last, after every tools/settings picker.
 */
export function tryNavigationPickerKeys(
  host: PickerKeysHost,
  input: string,
  key: KeyEvent,
  isEnter: boolean,
  debouncedEnter: (host: PickerKeysHost) => boolean,
): boolean {
  const { state, dispatch } = host;

  // ── Project picker ────────────────────────────────────────
  if (state.projectPicker.open) {
    if (key.ctrl || key.meta) return true;
    if (key.escape) {
      if (state.projectPicker.filter) {
        dispatch({ type: 'projectPickerFilter', filter: '' });
      } else {
        dispatch({ type: 'projectPickerClose' });
      }
      return true;
    }
    if (key.mouse?.kind === 'wheel') {
      dispatch({ type: 'projectPickerMove', delta: key.mouse.wheel > 0 ? -1 : 1 });
      return true;
    }
    if (key.upArrow) {
      dispatch({ type: 'projectPickerMove', delta: -1 });
      return true;
    }
    if (key.downArrow) {
      dispatch({ type: 'projectPickerMove', delta: 1 });
      return true;
    }
    if (isEnter) {
      if (debouncedEnter(host)) return true;
      host.inputGateRef.current = true;
      try {
        void host.onProjectPickerEnter?.();
      } finally {
        host.inputGateRef.current = false;
      }
      return true;
    }
    if (input && input.length === 1 && input.charCodeAt(0) >= 0x20 && input.charCodeAt(0) < 0x7f) {
      dispatch({ type: 'projectPickerFilter', filter: state.projectPicker.filter + input });
      return true;
    }
    if (key.backspace) {
      if (state.projectPicker.filter.length > 0) {
        dispatch({
          type: 'projectPickerFilter',
          filter: state.projectPicker.filter.slice(0, -1),
        });
      }
      return true;
    }
    return true;
  }

  // ── Sessions panel ────────────────────────────────────────
  if (state.sessionsPanelOpen) {
    if (key.escape) {
      if (state.sessionResumeConfirm) {
        dispatch({ type: 'sessionResumeConfirmClear' });
      } else {
        dispatch({ type: 'toggleSessionsPanel' });
      }
      return true;
    }
    if (key.upArrow) {
      dispatch({ type: 'sessionsPanelMove', delta: -1 });
      return true;
    }
    if (key.downArrow) {
      dispatch({ type: 'sessionsPanelMove', delta: 1 });
      return true;
    }
    if (key.mouse?.kind === 'wheel') {
      dispatch({ type: 'sessionsPanelMove', delta: key.mouse.wheel > 0 ? -1 : 1 });
      return true;
    }
    if (isEnter) {
      if (debouncedEnter(host)) return true;
      void host.onSessionsPanelEnter?.();
      return true;
    }
    return true;
  }

  // ── Slash picker ─────────────────────────────────────────
  if (state.slashPicker.open) {
    if (key.escape) {
      dispatch({ type: 'slashPickerClose' });
      return true;
    }
    if (key.mouse?.kind === 'wheel') {
      dispatch({ type: 'slashPickerMove', delta: key.mouse.wheel > 0 ? -1 : 1 });
      return true;
    }
    if (key.upArrow) {
      dispatch({ type: 'slashPickerMove', delta: -1 });
      return true;
    }
    if (key.downArrow) {
      dispatch({ type: 'slashPickerMove', delta: 1 });
      return true;
    }
    if (isEnter) {
      if (debouncedEnter(host)) return true;
      host.inputGateRef.current = true;
      try {
        host.onSlashPickerEnter?.();
      } finally {
        host.inputGateRef.current = false;
      }
      return true;
    }
    if (key.tab && state.slashPicker.matches.length > 0) {
      host.onSlashPickerTab?.();
      return true;
    }
    return false;
  }

  // ── F-key panel picker ─────────────────────────────────────
  if (state.fKeyPicker.open) {
    if (key.ctrl || key.meta) return true;
    if (key.escape) {
      dispatch({ type: 'fKeyPickerClose' });
      return true;
    }
    if (key.mouse?.kind === 'wheel') {
      dispatch({ type: 'fKeyPickerMove', delta: key.mouse.wheel > 0 ? -1 : 1 });
      return true;
    }
    if (key.upArrow) {
      dispatch({ type: 'fKeyPickerMove', delta: -1 });
      return true;
    }
    if (key.downArrow) {
      dispatch({ type: 'fKeyPickerMove', delta: 1 });
      return true;
    }
    if (isEnter) {
      if (debouncedEnter(host)) return true;
      host.onFKeyPickerEnter?.();
      return true;
    }
    return true;
  }

  // ── General picker ─────────────────────────────────────────
  if (state.picker.open) {
    if (key.escape) {
      dispatch({ type: 'pickerClose' });
      return true;
    }
    if (key.mouse?.kind === 'wheel') {
      dispatch({ type: 'pickerMove', delta: key.mouse.wheel > 0 ? -1 : 1 });
      return true;
    }
    if (key.upArrow) {
      dispatch({ type: 'pickerMove', delta: -1 });
      return true;
    }
    if (key.downArrow) {
      dispatch({ type: 'pickerMove', delta: 1 });
      return true;
    }
    if (isEnter) {
      if (debouncedEnter(host)) return true;
      host.inputGateRef.current = true;
      try {
        void host.onPickerEnter?.();
      } finally {
        host.inputGateRef.current = false;
      }
      return true;
    }
    return false;
  }

  return false;
}
