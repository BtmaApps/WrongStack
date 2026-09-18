import { describe, expect, it, vi } from 'vitest';
import type { KeyEvent } from '../src/components/input.js';
import { tryAuthModelPickerKeys } from '../src/hooks/use-picker-keys-auth-model.js';
import { tryToolsSettingsPickerKeys } from '../src/hooks/use-picker-keys-tools-settings.js';
import type { PickerKeysHost } from '../src/hooks/use-picker-keys-types.js';
import { createTestState } from './helpers/create-test-state.js';

describe.each(['ctrl', 'meta'] as const)(
  '%s does not trigger plain panel shortcuts',
  (modifier) => {
    it.each([
      'resourceMenu',
      'promptPicker',
      'mcpPicker',
      'shadowPanel',
      'subagentModels',
      'statuslinePicker',
      'authPanel',
      'modelPicker',
    ] as const)('%s keeps mutations and filters isolated', (panel) => {
      const state = createTestState();
      state[panel].open = true;
      if (panel === 'resourceMenu')
        state.resourceMenu.pendingAction = {
          key: 'x',
          label: 'delete',
          command: '/git delete',
          confirm: true,
        };
      if (panel === 'authPanel')
        state.authPanel.confirm = {
          question: 'Delete?',
          action: { kind: 'remove-provider', providerId: 'test' },
        };
      if (panel === 'modelPicker') state.modelPicker.step = 'model';
      const action = vi.fn();
      const host = {
        state,
        dispatch: action,
        submit: action,
        onPromptPickerFavorite: action,
        onMcpPickerRestart: action,
        onShadowStart: action,
        onSubagentLaneClear: action,
        onAuthConfirm: action,
      } as unknown as PickerKeysHost;
      const input = {
        resourceMenu: 'y',
        promptPicker: 'f',
        mcpPicker: 'r',
        shadowPanel: 's',
        subagentModels: 'c',
        statuslinePicker: 'r',
        authPanel: 'y',
        modelPicker: 'x',
      }[panel];
      const key = { ctrl: modifier === 'ctrl', meta: modifier === 'meta' } as KeyEvent;
      const handled =
        tryAuthModelPickerKeys(host, input, key, false, () => false) ||
        tryToolsSettingsPickerKeys(host, input, key, false, () => false);
      expect(handled).toBe(true);
      expect(action).not.toHaveBeenCalled();
    });
  },
);

it('Esc clears the settings filter before closing the panel', () => {
  const state = createTestState();
  state.settingsPicker.open = true;
  state.settingsPicker.filter = '/model';
  const dispatch = vi.fn();
  tryToolsSettingsPickerKeys(
    { state, dispatch } as unknown as PickerKeysHost,
    '',
    { escape: true } as KeyEvent,
    false,
    () => false,
  );
  expect(dispatch).toHaveBeenCalledWith({ type: 'settingsFilterSet', filter: '' });
});

it('settings text fields accept pasted Unicode and delete one grapheme', () => {
  const state = createTestState();
  state.settingsPicker.open = true;
  state.settingsPicker.thinkingWordEditing = true;
  state.settingsPicker.thinkingWordDraft = 'düşün👩‍💻';
  const dispatch = vi.fn();
  const host = { state, dispatch } as unknown as PickerKeysHost;
  tryToolsSettingsPickerKeys(host, '', { backspace: true } as KeyEvent, false, () => false);
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'settingsThinkingEditChange', draft: 'düşün' });
  tryToolsSettingsPickerKeys(host, ' çalışıyor', {} as KeyEvent, false, () => false);
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'settingsThinkingEditChange',
    draft: 'düşün👩‍💻 çalışıyor',
  });
});
