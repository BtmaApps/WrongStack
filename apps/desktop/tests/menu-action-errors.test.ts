/**
 * A menu click has no caller to receive an error.
 *
 * `configureApplicationMenu` wires every project-menu action as a fire-and-
 * forget promise (`activate: (runtimeId) => void ctx.activateRuntime(runtimeId)`).
 * The dependency it fires is real production code that rejects for ordinary
 * reasons — `DesktopRuntimeManager.activateRuntime` throws
 * `Runtime not found: ${id}` for an id that goes stale between the menu being
 * built and the click landing, and `touchProject` reaches the same
 * `fs.mkdir` / `atomicWrite` calls proven to reject in desktop-config-io. The
 * idle sweep can retire a runtime inside exactly that gap.
 *
 * With no `.catch()` that rejection becomes an unhandled rejection in the
 * Electron MAIN process. These cases build the real menu template, click it,
 * and assert on the process-level `unhandledRejection` event — the only place
 * the failure is observable, since `void` discards the promise and nothing
 * returns to assert on.
 */
import { describe, expect, it, vi } from 'vitest';

const menuCapture = vi.hoisted(() => ({ template: [] as unknown[] }));

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (template: unknown[]) => {
      menuCapture.template = template;
      return template;
    },
    setApplicationMenu: vi.fn(),
  },
}));

import { configureApplicationMenu } from '../src/main/menu/index.js';
import type { MenuBuilderContext } from '../src/main/menu/types.js';
import type { DesktopRuntimeRecord } from '../src/shared/types.js';

interface Item {
  label?: unknown;
  click?: unknown;
  submenu?: unknown;
}

const items = (node: unknown): Item[] => (Array.isArray(node) ? (node as Item[]) : []);

const RUNTIME: DesktopRuntimeRecord = {
  id: 'rt-1',
  name: 'demo',
  root: '/w/demo',
  slug: 'demo',
  kind: 'project',
  status: 'running',
  httpPort: 34560,
  wsPort: 34560,
  url: 'http://127.0.0.1:34560/',
  startedAt: '2026-09-09T12:00:00.000Z',
};

/**
 * Report whether Node saw an unhandled rejection while `action` ran.
 *
 * Two `setImmediate` turns: the first drains the microtask queue where the
 * rejected promise is created and abandoned, the second is the checkpoint at
 * which Node emits `unhandledRejection`. Event-driven, not a sleep.
 */
async function unhandledDuring(action: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    action();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return seen;
}

function context(over: Partial<MenuBuilderContext> = {}): MenuBuilderContext {
  return {
    getSnapshot: () => ({ runtimes: [RUNTIME], activeRuntimeId: RUNTIME.id }),
    getActiveRuntime: () => RUNTIME,
    getActiveWebuiPrefs: () => undefined,
    getShellSidebarCollapsed: () => false,
    t: (key: string) => key,
    getRuntimeManager: () => ({
      getRuntimeUrlWithToken: () => RUNTIME.url,
      getRuntime: () => RUNTIME,
    }),
    getWebuiViews: () => new Map(),
    dispatchWebuiCommand: vi.fn(async () => true),
    reloadActiveWebuiView: vi.fn(async () => true),
    activateRuntime: vi.fn(async () => undefined),
    openProject: vi.fn(async () => undefined),
    registerProject: vi.fn(async () => undefined),
    openSettings: vi.fn(async () => undefined),
    openProjectSession: vi.fn(async () => undefined),
    closeRuntime: vi.fn(async () => undefined),
    unregisterProject: vi.fn(async () => undefined),
    getActiveRuntimeId: () => RUNTIME.id,
    setShellSidebarCollapsed: vi.fn(),
    restoreLastWorkspace: vi.fn(async () => undefined),
    openExternal: vi.fn(),
    revealInExplorer: vi.fn(),
    ...over,
  };
}

/** Projects menu -> the single project group -> its per-session submenu. */
function sessionSubmenu(): Item[] {
  const template = items(menuCapture.template);
  const projects = items(template[1]?.submenu);
  const group = projects.find((item) => Array.isArray(item.submenu));
  expect(group, 'project group submenu should exist').toBeDefined();
  const session = items(group!.submenu).find((item) =>
    String(item.label ?? '').startsWith('session '),
  );
  expect(session, 'per-session submenu should exist').toBeDefined();
  return items(session!.submenu);
}

function click(items_: Item[], label: string): void {
  const item = items_.find((entry) => entry.label === label);
  expect(item, `menu item "${label}" should exist`).toBeDefined();
  (item!.click as () => void)();
}

describe('menu actions do not raise unhandled rejections', () => {
  it('swallows a rejected activateRuntime (stale runtime id) on Quick View', async () => {
    const activateRuntime = vi.fn(async () => {
      throw new Error('Runtime not found: rt-1');
    });
    configureApplicationMenu(context({ activateRuntime }));

    const seen = await unhandledDuring(() => click(sessionSubmenu(), 'quickView'));

    expect(activateRuntime).toHaveBeenCalledWith(RUNTIME.id);
    expect(seen, 'a rejected activateRuntime must not surface as an unhandled rejection').toEqual(
      [],
    );
  });

  it('swallows a rejected closeRuntime on Close Session', async () => {
    const closeRuntime = vi.fn(async () => {
      throw new Error('Runtime not found: rt-1');
    });
    configureApplicationMenu(context({ closeRuntime }));

    const seen = await unhandledDuring(() => click(sessionSubmenu(), 'closeSession'));

    expect(closeRuntime).toHaveBeenCalledWith(RUNTIME.id);
    expect(seen, 'a rejected closeRuntime must not surface as an unhandled rejection').toEqual([]);
  });

  it('swallows a rejected activateRuntime on the WebUI submenu navigation', async () => {
    const activateRuntime = vi.fn(async () => {
      throw new Error('Runtime not found: rt-1');
    });
    configureApplicationMenu(context({ activateRuntime }));

    const webui = sessionSubmenu().find((item) => item.label === 'WebUI');
    const seen = await unhandledDuring(() => click(items(webui?.submenu), 'chat'));

    expect(activateRuntime).toHaveBeenCalledWith(RUNTIME.id);
    expect(seen).toEqual([]);
  });

  it('still runs the action and stays silent on the healthy path (control)', async () => {
    const activateRuntime = vi.fn(async () => undefined);
    configureApplicationMenu(context({ activateRuntime }));

    const seen = await unhandledDuring(() => click(sessionSubmenu(), 'quickView'));

    // The control for the cases above: they assert silence because the action
    // really failed. A healthy click must still run, and stay silent.
    expect(activateRuntime).toHaveBeenCalledWith(RUNTIME.id);
    expect(seen).toEqual([]);
  });
});
