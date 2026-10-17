import { describe, expect, it, vi } from 'vitest';

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());

vi.mock('electron', () => {
  let id = 10;
  return {
    WebContentsView: class {
      getBounds = vi.fn(() => ({ x: 270, y: 0, width: 900, height: 650 }));
      webContents = {
        id: id++,
        mainFrame: {},
        isDestroyed: vi.fn(() => false),
        isLoading: vi.fn(() => false),
        isFocused: vi.fn(() => true),
        focus: vi.fn(),
        send: vi.fn(),
        on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          listeners.set(event, listener);
        }),
        close: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      };
    },
  };
});
vi.mock('../src/main/runtime-manager.js', () => ({ webuiPreloadPath: () => '/mock/preload.cjs' }));

import type { BaseWindow, WebContentsView } from 'electron';
import { IPC } from '../src/main/ipc.js';
import type { DesktopRuntimeManager } from '../src/main/runtime-manager.js';
import { DesktopWebuiController } from '../src/main/webui/controller.js';

function harness() {
  listeners.clear();
  const shell = {
    id: 1,
    mainFrame: {},
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    send: vi.fn(),
    focus: vi.fn(),
  };
  let activeRuntimeId = 'active';
  const controller = new DesktopWebuiController({
    manager: { snapshot: () => ({ activeRuntimeId }) } as unknown as DesktopRuntimeManager,
    trustBoundary: {} as ConstructorParameters<typeof DesktopWebuiController>[0]['trustBoundary'],
    getMainWindow: () => ({ contentView: { addChildView: vi.fn() } }) as unknown as BaseWindow,
    getShellView: () => ({ webContents: shell }) as unknown as WebContentsView,
    getLocale: () => 'en',
    layoutViews: vi.fn(),
  });
  const entry = controller.ensure('active');
  if (!entry) throw new Error('Missing view');
  entry.attached = true;
  entry.bridgeReady = true;
  entry.status = { runtimeId: entry.runtimeId, status: 'ready' };
  const from = (sender: object, frame: object = shell.mainFrame) =>
    ({ sender, senderFrame: frame }) as Parameters<typeof controller.routeFocus>[0];
  return {
    controller,
    shell,
    entry,
    from,
    switchRuntime: () => {
      activeRuntimeId = 'other';
    },
  };
}

describe('Desktop native boundary routing', () => {
  it('routes shell forward to the active WebUI', () => {
    const h = harness();
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(true);
    expect(h.entry.view.webContents.send).toHaveBeenCalledExactlyOnceWith(IPC.focusEdge, 'forward');
    expect(h.entry.view.webContents.focus).toHaveBeenCalledOnce();
  });

  it('routes WebUI backward to the shell', () => {
    const h = harness();
    const contents = h.entry.view.webContents;
    expect(h.controller.routeFocus(h.from(contents, contents.mainFrame), 'backward')).toBe(true);
    expect(h.shell.send).toHaveBeenCalledExactlyOnceWith(IPC.focusEdge, 'backward');
    expect(h.shell.focus).toHaveBeenCalledOnce();
  });

  it.each(['loading', 'error', 'idle'] as const)('does not route from a %s WebUI', (status) => {
    const h = harness();
    h.entry.status.status = status;
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
    expect(h.entry.view.webContents.focus).not.toHaveBeenCalled();
  });

  it('keeps mounted bridge readiness across spinner-only loading events', () => {
    const h = harness();
    listeners.get('did-start-loading')?.();
    expect(h.entry.bridgeReady).toBe(true);
    expect(h.entry.status.status).toBe('ready');
  });

  it('invalidates readiness before a new main-frame document navigates', () => {
    const h = harness();
    listeners.get('did-start-navigation')?.({ isMainFrame: true, isSameDocument: false });
    expect(h.entry.bridgeReady).toBe(false);
    expect(h.entry.status.status).toBe('loading');
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
  });

  it.each([
    { isMainFrame: true, isSameDocument: true },
    { isMainFrame: false, isSameDocument: false },
  ])('keeps the document bridge across harmless navigation %j', (details) => {
    const h = harness();
    listeners.get('did-start-navigation')?.(details);
    expect(h.entry.bridgeReady).toBe(true);
    expect(h.entry.status.status).toBe('ready');
  });

  it('rejects a frame other than the source main frame', () => {
    const h = harness();
    expect(h.controller.routeFocus(h.from(h.shell, {}), 'forward')).toBe(false);
  });

  it('rejects unrelated and formerly active senders', () => {
    const h = harness();
    expect(h.controller.routeFocus(h.from({}), 'forward')).toBe(false);
    const previous = h.entry.view.webContents;
    h.switchRuntime();
    expect(h.controller.routeFocus(h.from(previous, previous.mainFrame), 'backward')).toBe(false);
  });

  it('does not steal focus when the sending view is no longer focused', () => {
    const h = harness();
    h.shell.isFocused.mockReturnValue(false);
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
  });

  it('rejects disposed and detached views without invoking them', () => {
    const h = harness();
    h.entry.attached = false;
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
    h.entry.attached = true;
    h.entry.view.webContents.isDestroyed = () => true;
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
  });

  it('rejects zero-width, loading and not-yet-bridged views', () => {
    const h = harness();
    const bounds = h.entry.view.getBounds();
    h.entry.view.getBounds = () => ({ ...bounds, width: 0 });
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
    h.entry.view.getBounds = () => bounds;
    h.entry.view.webContents.isLoading = () => true;
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
    h.entry.view.webContents.isLoading = () => false;
    h.entry.bridgeReady = false;
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
  });

  it.each([null, {}, true, 'next'])('rejects malformed directions: %j', (direction) => {
    const h = harness();
    expect(h.controller.routeFocus(h.from(h.shell), direction)).toBe(false);
  });

  it('lets the source fall back locally if a native handoff fails during teardown', () => {
    const h = harness();
    h.entry.view.webContents.send = () => {
      throw new Error('Destroyed');
    };
    expect(h.controller.routeFocus(h.from(h.shell), 'forward')).toBe(false);
  });
});
