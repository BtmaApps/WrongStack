/**
 * WrongStack Desktop - Electron Application Entry Point
 *
 * Architecture:
 * - Main state is managed here (centralized for simplicity)
 * - Modules handle specific concerns:
 *   - layout/     → Window layout and sizing
 *   - menu/       → Application menu building
 *   - ipc-handlers/ → IPC message handlers
 *   - runtime/    → Project/runtime operations
 *   - state/      → Types and constants
 */
import * as path from 'node:path';
import { watchProviderConfig } from '@wrongstack/core/storage';
import {
  hardenWin32ExecutableSearch,
  installCrashShield,
  resolveWstackPaths,
} from '@wrongstack/core/utils';
import {
  app,
  BaseWindow,
  type BaseWindowConstructorOptions,
  dialog,
  screen,
  shell,
  WebContentsView,
} from 'electron';
import type { DesktopWebuiPrefs } from '../shared/types.js';
import { DesktopAgentBridge } from './agent-bridge.js';
import { loadDesktopAppIcon } from './app-icon.js';
import {
  desktopConfigPaths,
  readUiLocale,
  resolveActiveProfileConfigPath,
  writeUiLocale,
} from './desktop-config-io.js';
import {
  authorizeDesktopAction,
  desktopCompatibilityTrustBoundary,
} from './desktop-privileged-actions.js';
import { getMainLocale, setMainLocale, tMain } from './i18n-main.js';
import { IPC } from './ipc.js';
// IPC handler module
import { registerIpcHandlers as registerExtractedIpcHandlers } from './ipc-handlers/index.js';
// Layout module
import { getSidebarWidth } from './layout/index.js';
import { drainPendingOpenFilePath, firstOpenFileArg, initMacOS } from './macos-platform.js';
// Menu module
import { configureApplicationMenu as buildMenu } from './menu/index.js';
import type { MenuBuilderContext } from './menu/types.js';
import {
  activateRuntime as activateRuntimeOperation,
  closeRuntime as closeRuntimeOperation,
  openProject as openProjectOperation,
  openProjectSession as openProjectSessionOperation,
  openSettings as openSettingsOperation,
  type RuntimeOperationsContext,
  registerProject as registerProjectOperation,
  restoreLastWorkspace as restoreLastWorkspaceOperation,
  unregisterProject as unregisterProjectOperation,
} from './runtime/operations.js';
import { DesktopRuntimeManager, preloadPath, rendererIndexPath } from './runtime-manager.js';
import { installShellStateReplay } from './shell-state-replay.js';
// Constants — centralized in state/constants.ts to avoid duplication
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from './state/constants.js';
import type { IpcHandlerContext, IRuntimeManager } from './state/types.js';
import { DesktopWebuiController } from './webui/controller.js';
import { allowedExternalProtocol } from './webui/navigation.js';
import { DesktopWindowStateController } from './window-state-controller.js';

// macOS initialisation — must run before app.whenReady to ensure
// activation policy, open-file queuing, and Dock menu are registered
// before the event loop starts.
initMacOS();

// Windows-only: app user model id (used for taskbar grouping)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.wrongstack.desktop');
}
app.setPath(
  'userData',
  path.join(
    resolveWstackPaths({ projectRoot: process.cwd() }).configDir,
    'desktop',
    'electron-profile',
  ),
);

// ============================================================================
// Application State
// ============================================================================

const desktopTrustBoundary = desktopCompatibilityTrustBoundary;
const manager = new DesktopRuntimeManager(desktopTrustBoundary);
const bridge = new DesktopAgentBridge();

let mainWindow: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
let shellSidebarCollapsed = false;
let quittingAfterCleanup = false;

const webuiController = new DesktopWebuiController({
  manager,
  trustBoundary: desktopTrustBoundary,
  getMainWindow: () => mainWindow,
  getShellView: () => shellView,
  getLocale: getMainLocale,
  layoutViews: () => layoutWebuiViews(),
  onPrefsChanged: (previous, next) => {
    if (menuRelevantPrefsChanged(previous, next)) configureApplicationMenu();
  },
  onOpenSessionsChanged: (snapshot) => {
    if (!shellView || shellView.webContents.isDestroyed()) return;
    shellView.webContents.send(IPC.openSessionsChanged, snapshot);
  },
});

const windowStateController = new DesktopWindowStateController({
  getWindow: () => mainWindow,
  getDisplays: () => screen.getAllDisplays(),
  save: (state) => manager.saveWindowState(state),
});

// ============================================================================
// Utility Functions
// ============================================================================

function safeOpenExternal(target: string): void {
  const protocol = allowedExternalProtocol(target);
  if (protocol) {
    void authorizeDesktopAction(desktopTrustBoundary, {
      capability: 'url.open-external',
      subject: { kind: 'url', id: target, attributes: { protocol } },
      risk: 'elevated',
      origin: 'user',
      metadata: { operation: 'open-external' },
    }).then((authorization) => {
      if (authorization.allowed) return shell.openExternal(target);
      return undefined;
    });
  }
}

/** Open a directory in the platform file manager (Finder / Explorer). */
function revealInExplorer(root: string): void {
  // On macOS, `shell.openPath(dir)` opens Finder at the directory.
  // On Windows, it opens Explorer. On Linux, it opens the default
  // file manager.
  //
  // The promise is intentionally not awaited — it's a fire-and-forget
  // UI operation. Errors are logged but not surfaced because the
  // operation is non-critical.
  void authorizeDesktopAction(desktopTrustBoundary, {
    capability: 'filesystem.open-native',
    subject: { kind: 'path', id: root, attributes: { target: 'file-manager' } },
    risk: 'elevated',
    origin: 'user',
    cwd: root,
    metadata: { operation: 'reveal-in-explorer' },
  }).then((authorization) => {
    if (!authorization.allowed) return;
    return shell.openPath(root).catch((err) => {
      if (process.platform === 'darwin') {
        // macOS may fail if the path contains characters Finder can't
        // resolve (e.g., certain Unicode normalizations). Fall back to
        // the parent directory.
        void shell.openPath(path.dirname(root)).catch(() => undefined);
      }
      console.error(
        JSON.stringify({
          level: 'warn',
          event: 'desktop.reveal_in_explorer_failed',
          root,
          message: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        }),
      );
    });
  });
}

// ============================================================================
// State Helpers
// ============================================================================

function setShellSidebarCollapsed(collapsed: boolean): void {
  shellSidebarCollapsed = collapsed;
  layoutWebuiViews();
  configureApplicationMenu();
  if (!shellView || shellView.webContents.isDestroyed()) return;
  shellView.webContents.send(IPC.shellSidebarCollapsedChanged, shellSidebarCollapsed);
}

function menuRelevantPrefsChanged(
  previous: DesktopWebuiPrefs | undefined,
  next: DesktopWebuiPrefs | undefined,
): boolean {
  return (
    previous?.yolo !== next?.yolo ||
    previous?.nextPrediction !== next?.nextPrediction ||
    previous?.contextAutoCompact !== next?.contextAutoCompact
  );
}

// ============================================================================
// Layout Functions
// ============================================================================

/**
 * The area child views are actually laid out in.
 *
 * Deliberately `contentView.getBounds()` and not `getContentSize()`: with an
 * in-window menu bar (Windows and Linux; macOS puts the menu in the system bar)
 * the two disagree, and sizing views by the larger one puts the bottom of the
 * sidebar — its footer — below the visible client area.
 */
function clientSize(): { width: number; height: number } {
  const bounds = mainWindow?.contentView.getBounds();
  return { width: bounds?.width ?? 0, height: bounds?.height ?? 0 };
}

function layoutViews(): void {
  if (!mainWindow || !shellView) return;
  const { width, height } = clientSize();
  shellView.setBounds({ x: 0, y: 0, width, height });
  layoutWebuiViews();
}

/**
 * Re-run the layout once the client area has settled after `show()`.
 *
 * On Windows and Linux the in-window menu bar only takes its height out of the
 * client area when the window is actually shown, and it does so without
 * emitting `resize` — so the synchronous layout after `show()` sizes the shell
 * view to the pre-menu height and nothing ever corrects it. Measured on CI: the
 * view stayed 681px tall inside a 655px client area, which put the bottom of
 * the sidebar — its footer — below the visible region. macOS puts the menu in
 * the system bar and never showed this.
 *
 * Both passes compare before acting, so this is a no-op where the first layout
 * was already right.
 */
function reconcileLayoutAfterShow(): void {
  const reconcile = (): void => {
    if (!mainWindow || !shellView) return;
    const { width, height } = clientSize();
    const bounds = shellView.getBounds();
    if (bounds.width !== width || bounds.height !== height) layoutViews();
  };
  setTimeout(reconcile, 0);
  setTimeout(reconcile, 100);
}

function layoutWebuiViews(): void {
  if (!mainWindow) return;
  const { width, height } = clientSize();
  const snapshot = manager.snapshot();
  const active = snapshot.runtimes.find((runtime) => runtime.id === snapshot.activeRuntimeId);
  const sidebarWidth = getSidebarWidth(width, shellSidebarCollapsed);
  const contentWidth = Math.max(0, width - sidebarWidth);

  for (const entry of webuiController.views.values()) {
    const runtime = snapshot.runtimes.find((r) => r.id === entry.runtimeId);
    if (active?.id === entry.runtimeId && runtime?.status === 'running') {
      entry.view.setBounds({ x: sidebarWidth, y: 0, width: contentWidth, height });
    } else {
      entry.view.setBounds({ x: sidebarWidth, y: 0, width: 0, height });
    }
  }
}

// ============================================================================
// State Broadcasting
// ============================================================================

function broadcastState(): void {
  if (!shellView || shellView.webContents.isDestroyed()) return;
  shellView.webContents.send(IPC.stateChanged, manager.snapshot());
}

// ============================================================================
// Project/Runtime Operations
// ============================================================================

const runtimeOperationsContext: RuntimeOperationsContext = {
  getRuntimeManager: () => manager as unknown as IRuntimeManager,
  getAgentBridge: () => bridge,
  broadcastState,
  syncActiveWebuiView: () => webuiController.syncActive(),
  dispatchWebuiCommand: (command) => webuiController.dispatch(command),
  chooseProjectRoot: async (kind) => {
    const result = await dialog.showOpenDialog({
      title: tMain(kind === 'open' ? 'openProject' : 'registerProject'),
      properties: ['openDirectory'],
    });
    return result.filePaths[0];
  },
};

const openProject = (root?: string) => openProjectOperation(runtimeOperationsContext, root);
const registerProject = (root?: string) => registerProjectOperation(runtimeOperationsContext, root);
const unregisterProject = (root: string) =>
  unregisterProjectOperation(runtimeOperationsContext, root);
const openProjectSession = (id?: string) =>
  openProjectSessionOperation(runtimeOperationsContext, id);
const openSettings = () => openSettingsOperation(runtimeOperationsContext);
const activateRuntime = (id: string) => activateRuntimeOperation(runtimeOperationsContext, id);
const closeRuntime = (id: string) => closeRuntimeOperation(runtimeOperationsContext, id);
const restoreLastWorkspace = () => restoreLastWorkspaceOperation(runtimeOperationsContext);

// ============================================================================
// ============================================================================
// Menu Configuration (delegated to menu/ module)
// ============================================================================

/**
 * Create the menu context for building the application menu.
 * This context is passed to the menu/ module's configureApplicationMenu.
 */
function createMenuContext(): MenuBuilderContext {
  return {
    getSnapshot: () => manager.snapshot(),
    getActiveRuntime: () => {
      const snapshot = manager.snapshot();
      return snapshot.runtimes.find((r) => r.id === snapshot.activeRuntimeId);
    },
    getActiveWebuiPrefs: () => {
      const snapshot = manager.snapshot();
      if (!snapshot.activeRuntimeId) return undefined;
      return webuiController.views.get(snapshot.activeRuntimeId)?.status.prefs;
    },
    getShellSidebarCollapsed: () => shellSidebarCollapsed,
    t: tMain,
    getRuntimeManager: () => manager,
    getWebuiViews: () => webuiController.views,
    dispatchWebuiCommand: (command) => webuiController.dispatch(command),
    reloadActiveWebuiView: () => webuiController.reload(),
    activateRuntime: async (id) => {
      await activateRuntime(id);
    },
    openProject: async () => {
      await openProject();
    },
    registerProject: async () => {
      await registerProject();
    },
    openSettings: async () => {
      await openSettings();
    },
    openProjectSession: async (id) => {
      await openProjectSession(id);
    },
    closeRuntime: async (id) => {
      await closeRuntime(id);
    },
    unregisterProject: async (root) => {
      await unregisterProject(root);
    },
    getActiveRuntimeId: () => webuiController.activeRuntimeId,
    setShellSidebarCollapsed: (collapsed) => {
      setShellSidebarCollapsed(collapsed);
    },
    restoreLastWorkspace: async () => {
      await restoreLastWorkspace();
    },
    openExternal: (url) => {
      safeOpenExternal(url);
    },
    revealInExplorer: (root) => {
      revealInExplorer(root);
    },
  };
}

/**
 * Configure the application menu using the menu module.
 */
function configureApplicationMenu(): void {
  buildMenu(createMenuContext());
  // Windows menus change the client height without necessarily emitting resize.
  layoutViews();
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Build the context object for the extracted IPC handler module.
 * Wires module-level state into the IpcHandlerContext interface.
 */
function buildIpcHandlerContext(): IpcHandlerContext {
  return {
    getMainWindow: () => mainWindow,
    getShellView: () => shellView,
    getWebuiViews: () => webuiController.views,
    getWebuiStatus: () => webuiController.status,
    getOpenSessions: () => webuiController.openSessionSnapshots(),
    getRuntimeManager: () => manager as unknown as IRuntimeManager,
    getAgentBridge: () => bridge,
    getI18n: () => ({ getMainLocale, setMainLocale, tMain }),
    getConfigIo: () => ({ desktopConfigPaths, readUiLocale, writeUiLocale }),
    getShellSidebarCollapsed: () => shellSidebarCollapsed,
    setShellSidebarCollapsed: (collapsed) => setShellSidebarCollapsed(collapsed),
    broadcastState: () => broadcastState(),
    publishWebuiStatus: (next) => {
      const entry = next.runtimeId ? webuiController.views.get(next.runtimeId) : undefined;
      if (entry) webuiController.setEntryStatus(entry, next);
    },
    syncActiveWebuiView: () => webuiController.syncActive(),
    configureApplicationMenu: () => configureApplicationMenu(),
    broadcastLocaleToEmbeddedWebuis: (locale) => webuiController.broadcastLocale(locale),
    dispatchWebuiCommand: (command) => webuiController.dispatch(command),
    reloadActiveWebuiView: () => webuiController.reload(),
    openProject: (root) => openProject(root),
    registerProject: (root) => registerProject(root),
    unregisterProject: (root) => unregisterProject(root),
    openProjectSession: (id) => openProjectSession(id),
    activateRuntime: (id) => activateRuntime(id),
    closeRuntime: (id) => closeRuntime(id),
    openSettings: () => openSettings(),
    sendMessage: (id, wsUrl, content) => bridge.sendMessage(id, wsUrl, content),
    abortRuntime: (id, wsUrl) => bridge.abort(id, wsUrl),
    openExternal: (url) => safeOpenExternal(url),
    revealInExplorer: (root) => {
      revealInExplorer(root);
    },
    findWebuiEntryBySenderId: (senderId) => webuiController.findBySenderId(senderId),
    getPendingWebuiCommandAcks: () => webuiController.pendingAcks,
    settlePendingWebuiCommandAck: (requestId, handled) =>
      webuiController.settleAck(requestId, handled),
    setEntryWebuiStatus: (entry, next) => webuiController.setEntryStatus(entry, next),
    schedulePendingWebuiFlush: (entry) => webuiController.scheduleFlush(entry),
    setOpenSessions: (runtimeId, sessions) => webuiController.setOpenSessions(runtimeId, sessions),
  };
}

// ============================================================================
// Boot Sequence
// ============================================================================

const desktopSmokeTest = process.argv.includes('--desktop-smoke-test');
let bootPhase = 'app ready';

async function boot(): Promise<void> {
  bootPhase = 'read locale';
  const locale = await readUiLocale();
  if (locale) setMainLocale(locale);

  const shellUrl = rendererIndexPath();
  shellView = new WebContentsView({
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // OS-level renderer sandbox. contextIsolation and nodeIntegration:false
      // already bound what renderer JS can reach through the bridge; the
      // sandbox is what contains the renderer PROCESS if it is compromised
      // through the content it renders. This preload only imports electron's
      // contextBridge/ipcRenderer plus a constants map, so it runs unchanged
      // under the sandboxed preload subset (WS-093).
      sandbox: true,
    },
  });
  shellView.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });
  // The WebUI view has had this since it was written; the shell view had only
  // the window-open handler, so an in-page navigation (a link, a script
  // setting location) could move the shell itself off its local renderer
  // entry point instead of opening externally (WS-093).
  shellView.webContents.on('will-navigate', (event, url) => {
    if (url === shellUrl) return;
    event.preventDefault();
    safeOpenExternal(url);
  });

  // The shell preload can invoke desktop:* channels during renderer startup.
  registerExtractedIpcHandlers(buildIpcHandlerContext());

  installShellStateReplay(shellView.webContents, () => ({
    locale: getMainLocale(),
    sidebarCollapsed: shellSidebarCollapsed,
  }));
  bootPhase = 'load shell renderer';
  await shellView.webContents.loadURL(shellUrl);

  const prevState = windowStateController.validated(manager.getWindowState());
  const defaultWidth = 1180;
  const defaultHeight = 720;

  bootPhase = 'load app icon';
  const appIcon = await loadDesktopAppIcon();

  const winOptions: BaseWindowConstructorOptions = {
    width: prevState?.width ?? defaultWidth,
    height: prevState?.height ?? defaultHeight,
    show: false,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: tMain('windowTitle'),
    ...(appIcon ? { icon: appIcon } : {}),
  };
  if (prevState) {
    if (prevState.x !== undefined) winOptions.x = prevState.x;
    if (prevState.y !== undefined) winOptions.y = prevState.y;
  }

  mainWindow = new BaseWindow(winOptions);
  mainWindow.on('resized', () => windowStateController.scheduleSave());
  mainWindow.on('moved', () => windowStateController.scheduleSave());
  mainWindow.on('maximize', () => windowStateController.scheduleSave());
  mainWindow.on('unmaximize', () => windowStateController.scheduleSave());

  if (prevState?.maximized) {
    mainWindow.maximize();
  }

  mainWindow.contentView.addChildView(shellView);
  layoutViews();

  configureApplicationMenu();

  mainWindow.on('resize', layoutViews);

  bridge.on('changed', (conversation) => {
    if (!shellView || shellView.webContents.isDestroyed()) return;
    shellView.webContents.send(IPC.conversationChanged, conversation);
  });

  manager.on('changed', () => {
    webuiController.syncActive();
    configureApplicationMenu();
    broadcastState();
  });

  // macOS open-file events — forward to IPC so the shell renderer can
  // decide whether to open the path as a project or register it.
  app.on('open-file', (_event, filePath) => {
    if (shellView && !shellView.webContents.isDestroyed()) {
      shellView.webContents.send(IPC.openFile, filePath);
    }
  });

  let lastWatchedLocale: string | undefined;
  bootPhase = 'watch profile';
  const activeProfileConfigPath = await resolveActiveProfileConfigPath();
  watchProviderConfig(activeProfileConfigPath, desktopConfigPaths.vault, (snapshot) => {
    const updated = snapshot.uiLocale;
    if (!updated || updated === lastWatchedLocale) return;
    lastWatchedLocale = updated;
    setMainLocale(updated);
    configureApplicationMenu();
    webuiController.broadcastLocale(updated);
    if (shellView && !shellView.webContents.isDestroyed()) {
      shellView.webContents.send(IPC.localeChanged, updated);
    }
  });

  mainWindow.on('close', (event) => {
    if (quittingAfterCleanup) return;
    event.preventDefault();
    bridge.closeAll();
    webuiController.disposeAll();
    quittingAfterCleanup = true;
    // save() is async disk I/O (fs.mkdir + atomicWrite). Exit only after it
    // settles — app.exit(0) immediately after a fire-and-forget save raced the
    // write and lost the final window geometry on quit. .finally keeps the app
    // closeable even if the write fails.
    void windowStateController.save().finally(() => app.exit(0));
  });

  bootPhase = 'restore workspace';
  await restoreLastWorkspace();

  // Reclaim project servers nobody is using. Every open project holds an
  // Electron-as-Node child; ten open projects were ten of them, alive until
  // quit. A project that is actively producing output is never reclaimed —
  // see `reclaimableRuntimeIds`.
  manager.startIdleSweep();

  // macOS: handle file-open from argv (app launched by double-click) or
  // from a pre-ready open-file event (queued by Electron's event system).
  const argvOpenPath = firstOpenFileArg(process.argv);
  const queuedOpenPath = drainPendingOpenFilePath();
  const openPath = argvOpenPath ?? queuedOpenPath;
  if (openPath && shellView && !shellView.webContents.isDestroyed()) {
    shellView.webContents.send(IPC.openFile, openPath);
  }

  mainWindow.show();
  layoutViews();
  reconcileLayoutAfterShow();
  shellView.webContents.focus();
  bootPhase = 'ready';
}

// ============================================================================
// App Lifecycle
// ============================================================================

// Same last-resort shield as the CLI host: a background rejection in a watcher,
// IPC handler, or the agent bridge must not take the desktop app down (WS-076).
installCrashShield();
// WS-2026-09-15-NV1: bare executable names must never resolve from the opened
// project directory (see core/utils/win32-exe-search.ts).
hardenWin32ExecutableSearch();

// `boot` is async — an unhandled rejection here would leave the app running with
// no window and no error shown, which reads to the user as a silent hang.
const smokeTimer = desktopSmokeTest
  ? setTimeout(() => {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'desktop.smoke_timeout',
          bootPhase,
          timestamp: new Date().toISOString(),
        }),
      );
      app.exit(1);
    }, 30_000)
  : undefined;

app
  .whenReady()
  .then(boot)
  .then(async () => {
    if (desktopSmokeTest) {
      const waitForShell = async (expression: string, failure: string) => {
        for (let attempt = 0; attempt < 50; attempt++) {
          if (await shellView!.webContents.executeJavaScript(expression)) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(failure);
      };
      const settingsLabel = JSON.stringify(tMain('settings'));
      const localeReady = `Array.from(document.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === ${settingsLabel})`;
      await waitForShell(
        `Boolean(window.wrongstackDesktop && document.querySelector('.sidebar') && ${localeReady})`,
        'Desktop renderer, preload or locale did not initialize',
      );
      const footerBottom = await shellView!.webContents.executeJavaScript(
        'document.querySelector(".sidebar-foot")?.getBoundingClientRect().bottom ?? 0',
      );
      const clientHeight = mainWindow!.contentView.getBounds().height;
      if (footerBottom > clientHeight) {
        // Report the measurements. A bare assertion cost a round trip to learn
        // by how much; the height alone cost another, because `footer bottom
        // 681` reads the same whether the viewport is still 681 or the viewport
        // is 655 and the sidebar overflows it by 26. innerHeight and the view's
        // own bounds separate those two.
        const [, contentSizeHeight] = mainWindow!.getContentSize();
        const viewHeight = shellView!.getBounds().height;
        const renderer = await shellView!.webContents.executeJavaScript(
          '({ inner: window.innerHeight, sidebar: document.querySelector(".sidebar")?.getBoundingClientRect().height ?? 0 })',
        );
        throw new Error(
          `Desktop footer extends beyond the native client area: footer bottom ${footerBottom}, ` +
            `contentView height ${clientHeight}, getContentSize height ${contentSizeHeight}, ` +
            `shellView height ${viewHeight}, innerHeight ${renderer.inner}, ` +
            `sidebar height ${renderer.sidebar}`,
        );
      }
      setShellSidebarCollapsed(true);
      await shellView!.webContents.loadURL(rendererIndexPath());
      await waitForShell(
        `Boolean(document.querySelector('.rail') && ${localeReady})`,
        'Desktop reload lost native sidebar or locale state',
      );
      console.log('Desktop reload state OK');
      clearTimeout(smokeTimer);
      console.log('Desktop window ready');
      app.exit(0);
    }
  })
  .catch((error: unknown) => {
    clearTimeout(smokeTimer);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    // Not localised on purpose: boot failed before the renderer could push a
    // locale over IPC, so tMain would resolve to the 'en' catalog regardless.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'desktop.boot_failed',
        bootPhase,
        message: detail,
        timestamp: new Date().toISOString(),
      }),
    );
    if (!desktopSmokeTest) dialog.showErrorBox('WrongStack failed to start', detail);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  // Standard macOS behavior: the app stays running when all windows
  // are closed (the user can open a new window from the Dock or menu).
  // On Windows and Linux, closing the last window quits the app.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    void windowStateController.save();
  }
  bridge.closeAll();
  webuiController.disposeAll();
  manager.stopIdleSweep();
  // Terminate WebUI child processes so they don't become orphans after the
  // desktop app exits. closeAll() is async but before-quit is synchronous —
  // we fire-and-forget and rely on OS process-group cleanup for stragglers.
  void manager.closeAll({ persistWorkspace: false });
});

app.on('activate', () => {
  if (!mainWindow) return;
  mainWindow.show();
  shellView?.webContents.focus();
});
