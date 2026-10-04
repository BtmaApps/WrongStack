import type { Action } from '../app-action-type.js';

export const settingsValueActionTypes = [
  'settingsValueChange',
  'settingsValueSet',
  'settingsHint',
  'settingsThinkingEditStart',
  'settingsThinkingEditChange',
  'settingsThinkingEditCommit',
  'settingsThinkingEditCancel',
  // WrongProxy / WrongTrace URL (field 60) text-edit quartet.
  // Adding these here routes them into `reduceSettingsValues` via the
  // `SettingsValueAction` extract — without these, the actions hit the
  // generic `reduce*` path and the `action satisfies never` narrowing
  // marks the whole `Action` union as unassignable to `never`.
  'settingsWrongProxyUrlEditStart',
  'settingsWrongProxyUrlEditChange',
  'settingsWrongProxyUrlEditCommit',
  'settingsWrongProxyUrlEditCancel',
] as const satisfies readonly Action['type'][];

export type SettingsValueAction = Extract<
  Action,
  { type: (typeof settingsValueActionTypes)[number] }
>;

export const settingsValueActionTypeSet = new Set<string>(settingsValueActionTypes);

export function isSettingsValueAction(action: Action): action is SettingsValueAction {
  return settingsValueActionTypeSet.has(action.type);
}
