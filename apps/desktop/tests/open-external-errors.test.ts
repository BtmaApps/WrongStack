/**
 * Opening a link outside the app has no caller to receive an error.
 *
 * `shell.openExternal` returns a promise that REJECTS when the OS cannot hand
 * the URL to anything — the classic case is a `mailto:` link (an allowlisted
 * protocol) on a machine with no mail client registered. Both desktop entry
 * points fire it from a context that discards the result: a
 * `setWindowOpenHandler` / `will-navigate` callback in the WebUI view, and the
 * shell's `safeOpenExternal`, reached from IPC and the application menu.
 *
 * The controller's chain used to read
 * `.then((d) => (d.allowed ? void shell.openExternal(target) : undefined)).catch(...)`:
 * the `void` throws the openExternal promise away INSIDE the `.then`, so the
 * trailing `.catch` never sees it and the rejection floats to the Electron
 * main process. These cases click through the real controller and assert on
 * the process-level `unhandledRejection` event, the only place the failure is
 * observable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const electronState = vi.hoisted(() => ({
  openExternal: (_url: string): Promise<void> => Promise.resolve(),
  windowOpenHandlers: [] as Array<(details: { url: string }) => unknown>,
}));

vi.mock('electron', () => ({
  // A plain forwarding function, not `vi.fn`: the spy wrapper attaches its own
  // handler to a promise it returns directly, which would hide the very
  // rejection under test.
  shell: { openExternal: (url: string) => electronState.openExternal(url) },
  WebContentsView: class {
    readonly setBounds = vi.fn();
    readonly webContents = {
      id: 1,
      setWindowOpenHandler: (handler: (details: { url: string }) => unknown) => {
        electronState.windowOpenHandlers.push(handler);
      },
      on: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isLoading: vi.fn(() => false),
      close: vi.fn(),
      send: vi.fn(),
      focus: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      executeJavaScript: vi.fn(() => Promise.resolve()),
    };
  },
}));

vi.mock('../src/main/runtime-manager.js', () => ({
  webuiPreloadPath: () => '/mock/webui-preload.js',
}));

vi.mock('../src/main/desktop-privileged-actions.js', () => ({
  authorizeDesktopAction: async () => ({ allowed: true, reason: 'test' }),
}));

import type { TrustBoundary } from '@wrongstack/core/security';
import type { BaseWindow, WebContentsView } from 'electron';
import type { DesktopRuntimeManager } from '../src/main/runtime-manager.js';
import { DesktopWebuiController } from '../src/main/webui/controller.js';

/**
 * Report whether Node saw an unhandled rejection while `action` ran.
 *
 * Three `setImmediate` turns: authorization resolves, then openExternal
 * rejects, then Node reaches the checkpoint at which it emits
 * `unhandledRejection`. Event-driven, not a sleep.
 */
async function unhandledDuring(action: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    action();
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

function controllerWithView(): (url: string) => unknown {
  electronState.windowOpenHandlers = [];
  const manager = {
    snapshot: () => ({ runtimes: [{ id: 'runtime-1', status: 'running' }] }),
    getRuntimeUrlWithToken: () => 'http://127.0.0.1:3000/?token=test',
  } as unknown as DesktopRuntimeManager;
  const controller = new DesktopWebuiController({
    manager,
    trustBoundary: {} as TrustBoundary,
    getMainWindow: () =>
      ({
        contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      }) as unknown as BaseWindow,
    getShellView: () =>
      ({ webContents: { isDestroyed: () => false, send: vi.fn() } }) as unknown as WebContentsView,
    getLocale: () => 'en',
    layoutViews: vi.fn(),
  });
  controller.ensure('runtime-1');
  const handler = electronState.windowOpenHandlers[0];
  if (!handler) throw new Error('controller did not install a window-open handler');
  return (url) => handler({ url });
}

afterEach(() => {
  electronState.openExternal = () => Promise.resolve();
  vi.restoreAllMocks();
});

describe('WebUI view external links', () => {
  it('absorbs a rejected openExternal from a window.open in the WebUI', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    electronState.openExternal = () =>
      Promise.reject(new Error('Failed to open: no application is associated with mailto'));
    const openWindow = controllerWithView();
    const seen = await unhandledDuring(() => {
      openWindow('mailto:team@example.com');
    });
    expect(seen).toEqual([]);
  });

  it('still opens the link when the OS accepts it (control)', async () => {
    const opened: string[] = [];
    electronState.openExternal = async (url) => {
      opened.push(url);
    };
    const openWindow = controllerWithView();
    const seen = await unhandledDuring(() => {
      openWindow('https://example.com/docs');
    });
    expect(seen).toEqual([]);
    expect(opened).toEqual(['https://example.com/docs']);
  });
});
