import { ACTIVITY_SHORTCUT_BY_KEY } from '@/lib/view-navigation';
import type { Activity } from '@/stores/ui-store';

/**
 * Display contract for one shortcut row in ShortcutsOverlay.
 * (`keys` are platform-key labels; `descKey` is an i18n key under
 * `activity:shortcuts.*`.)
 */
export interface ShortcutDisplay {
  keys: string[];
  descKey: string;
}

/**
 * The single display-label mapping for panel-jump shortcuts.
 *
 * The panel-jump rows rendered by ShortcutsOverlay's global section are
 * DERIVED from the handler table `ACTIVITY_SHORTCUT_BY_KEY` — a rebound digit
 * can never advertise a stale panel. This map is the one place that turns an
 * `Activity` into its overlay description key; adding a panel means adding
 * one entry here (plus its translations).
 */
export const ACTIVITY_PANEL_DESC_KEY: Readonly<Record<Activity, string>> = {
  chat: 'dOpenChatPanel',
  agents: 'dOpenAgentsPanel',
  files: 'dOpenFilesPanel',
  changes: 'dOpenChangesPanel',
  mailbox: 'dOpenMailboxPanel',
  skills: 'dOpenSkillsPanel',
  design: 'dDesignStudio',
};

/**
 * Panel-jump shortcut rows, one per entry of `ACTIVITY_SHORTCUT_BY_KEY`,
 * in table order. Consumed by ShortcutsOverlay's global section.
 */
export const ACTIVITY_PANEL_SHORTCUTS: readonly ShortcutDisplay[] = Object.entries(
  ACTIVITY_SHORTCUT_BY_KEY,
).map(([digit, activity]) => ({
  keys: ['Ctrl', digit],
  descKey: ACTIVITY_PANEL_DESC_KEY[activity],
}));
