/**
 * Application menu builder.
 * Builds the complete application menu with all sections.
 */
import { Menu } from 'electron';
import type { DesktopWebuiCommand } from '../../shared/types.js';
import type { MenuBuilderContext, ProjectMenuActions } from './types.js';
import { buildProjectsMenu } from './projects-menu.js';
import { buildFileMenu, buildWorkspaceMenu, buildViewMenu } from './sections.js';

export {
  buildProjectsMenu,
  normalizeMenuRoot,
  groupProjectRuntimesForMenu,
} from './projects-menu.js';
export * from './types.js';

/**
 * Configure the complete application menu.
 * This is the main entry point for building the menu.
 */
export function configureApplicationMenu(ctx: MenuBuilderContext): void {
  const snapshot = ctx.getSnapshot();
  const active = ctx.getActiveRuntime();
  const hasActiveRuntime = Boolean(active);
  const hasActiveWebui = active?.status === 'running';
  const hasActiveProjectWebui = hasActiveWebui && active?.kind === 'project';
  const activeWebuiPrefs = ctx.getActiveWebuiPrefs();

  // A menu click has no caller to receive a rejection: Electron invokes the
  // `click` handler and discards whatever it returns. The operations below do
  // reject for ordinary reasons — `activateRuntime` throws `Runtime not
  // found: ${id}` when the id goes stale between the menu being built and the
  // click landing, and `touchProject` reaches the same `fs.mkdir` /
  // `atomicWrite` calls proven to reject in desktop-config-io. Left bare, any
  // of those is an unhandled rejection in the Electron MAIN process.
  //
  // Absorb it the way `agent-bridge.ts` does for its automatic reconnects, and
  // log it: the operation failed, and silence would make a dead project
  // indistinguishable from an ignored click.
  const absorb = (work: Promise<unknown>): void => {
    void work.catch((error: unknown) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'desktop.menu_action_failed',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    });
  };

  const navigate = (command: DesktopWebuiCommand) => {
    absorb(ctx.dispatchWebuiCommand(command));
  };

  const activateAndNavigate = (runtimeId: string, command: DesktopWebuiCommand) => {
    absorb(ctx.activateRuntime(runtimeId).then(() => ctx.dispatchWebuiCommand(command)));
  };

  const reloadRuntimeWebui = (runtimeId: string) => {
    absorb(ctx.activateRuntime(runtimeId).then(() => ctx.reloadActiveWebuiView()));
  };

  const actions: ProjectMenuActions = {
    activate: (runtimeId) => absorb(ctx.activateRuntime(runtimeId)),
    activateAndNavigate,
    registerProject: () => absorb(ctx.registerProject()),
    newSession: (runtimeId) => {
      if (runtimeId) absorb(ctx.openProjectSession(runtimeId));
      else absorb(ctx.openProject());
    },
    openBrowser: (runtimeId) => {
      const url = ctx.getRuntimeManager().getRuntimeUrlWithToken(runtimeId);
      if (url) ctx.openExternal(url);
    },
    reload: reloadRuntimeWebui,
    close: (runtimeId) => absorb(ctx.closeRuntime(runtimeId)),
    reveal: (runtimeId) => {
      const runtime = ctx.getRuntimeManager().getRuntime(runtimeId);
      if (runtime) ctx.revealInExplorer(runtime.root);
    },
  };

  const template: import('electron').MenuItemConstructorOptions[] = [
    buildFileMenu(
      ctx,
      actions,
      hasActiveRuntime,
      hasActiveProjectWebui,
      active,
      navigate,
      ctx.getActiveRuntimeId,
    ),
    {
      label: ctx.t('projects'),
      submenu: buildProjectsMenu(snapshot.runtimes, actions, ctx.t),
    },
    buildWorkspaceMenu(ctx, actions, hasActiveWebui, activeWebuiPrefs, navigate),
    buildViewMenu(ctx),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
