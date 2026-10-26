import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { Snapshot } from './model';

export const native = isTauri();
export const request = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
  if (!native)
    return Promise.reject(
      new Error('Open the Tauri desktop to connect to your local WrongStack engine.'),
    );
  return invoke<T>('host_request', { method, params });
};
const projectWindow = new URLSearchParams(location.search).get('project');
export const layoutKey = projectWindow ? `layout:${projectWindow}` : 'layout';
export const getSnapshot = (): Promise<Snapshot> => request('snapshot', { layoutKey });
export async function addProject(): Promise<void> {
  const root = await invoke<string | null>('choose_project');
  if (root) await request('project.register', { root });
}
export const openProjectWindow = (id: string): Promise<void> =>
  invoke('open_project_window', { id });
export const openPreview = (url: string): Promise<void> => invoke('open_preview', { url });
export const openExternal = (url: string): Promise<void> => invoke('open_external', { url });
export function streamTerminal(
  id: string,
  onData: (data: Uint8Array, acknowledge: () => void) => void,
  onError: (error: unknown) => void,
): () => void {
  const subscription = crypto.randomUUID();
  const channel = new Channel<ArrayBuffer>();
  let disposed = false;
  channel.onmessage = (bytes) => {
    if (!disposed)
      onData(new Uint8Array(bytes), () => {
        if (!disposed) void invoke('terminal_ack', { subscription }).catch(onError);
      });
  };
  const started = invoke('terminal_stream', { id, subscription, channel });
  void started.catch(onError);
  return () => {
    disposed = true;
    // Wait for registration before cancellation, including React StrictMode's mount/unmount cycle.
    void started.then(() => invoke('terminal_stop', { subscription })).catch(onError);
  };
}
