import { ipcRenderer } from 'electron';
import { installFocusBoundary } from '../shared/focus-boundary.js';
import { IPC } from './ipc.js';

export function installPreloadFocus() {
  const boundary = installFocusBoundary(document, {
    request: async (direction) => (await ipcRenderer.invoke(IPC.focusBoundary, direction)) === true,
    onFocus: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, direction: unknown): void => {
        if (direction === 'forward' || direction === 'backward') listener(direction);
      };
      ipcRenderer.on(IPC.focusEdge, receive);
      return () => ipcRenderer.off(IPC.focusEdge, receive);
    },
  });
  window.addEventListener('unload', () => boundary.dispose(), { once: true });
  return boundary;
}
