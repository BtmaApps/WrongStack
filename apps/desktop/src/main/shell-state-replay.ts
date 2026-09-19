import type { WebContents } from 'electron';
import { IPC } from './ipc.js';

/** Replay host-owned UI state on first load and renderer reload. */
export function installShellStateReplay(
  contents: Pick<WebContents, 'on' | 'send' | 'isDestroyed'>,
  readState: () => { locale: string; sidebarCollapsed: boolean },
): void {
  contents.on('did-finish-load', () => {
    if (contents.isDestroyed()) return;
    const state = readState();
    contents.send(IPC.localeChanged, state.locale);
    contents.send(IPC.shellSidebarCollapsedChanged, state.sidebarCollapsed);
  });
}
