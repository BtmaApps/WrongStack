import { toErrorMessage } from '@wrongstack/core/utils';
import type { Action, State } from '../app-reducer.js';
import type { AuthPanelHost } from '../auth-panel-model.js';

export interface UseAuthPanelOptions {
  authHost: AuthPanelHost | undefined;
  stateRef: { current: State };
  dispatch: React.Dispatch<Action>;
  /**
   * Live `state.authPanel.open` — when the panel closes from OUTSIDE the
   * controller (another panel's `closePanels`, an F-key toggle, Ctrl+C),
   * any in-flight flow must be aborted so an invisible prompt can't leave
   * an OAuth loopback server (or a pending readline promise) running
   * behind a closed panel.
   */
  open: boolean;
}

export interface AuthPanelController {
  /** Open the panel (used by `/auth` via the panel bridge). No-op without a host. */
  openAuthPanel: (view?: 'list' | 'oauth') => boolean;
  onAuthEnter: () => void;
  onAuthBack: () => void;
  onAuthShortcut: (input: string) => void;
  onAuthPromptSubmit: () => void;
  onAuthPromptCancel: () => void;
  onAuthConfirm: (yes: boolean) => void;
  onAuthFlowCancel: () => void;
  /**
   * Ctrl+C while the panel is open. In raw-mode terminals (ConPTY, most
   * Windows setups) Ctrl+C arrives as key DATA — not a SIGINT — so the
   * key router must handle it; the app's SIGINT ladder covers the
   * console-event delivery path. Both paths abort any in-flight flow and
   * close the panel.
   */
  onAuthCtrlC: () => void;
  /** Open the existing masked modal for a slash-command secret prompt. */
  readSecret: (label: string) => Promise<string>;
  /** Open the same modal with visible text for slash-command selections. */
  readText: (label: string) => Promise<string>;
}

export function abortError(): Error {
  return Object.assign(new Error('Cancelled'), { name: 'AbortError' });
}

export function toMessage(err: unknown): string {
  return toErrorMessage(err);
}
