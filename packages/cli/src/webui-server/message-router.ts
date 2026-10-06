/** Maps the CLI host's route contexts and domain handlers onto the shared embedded message router. */

import { createEmbeddedMessageRouter } from '@wrongstack/webui-server';
import type { CliWebUIOptions } from '../webui-server-options.js';
import type { createWebuiDomainHandlers } from './domain-handlers.js';
import { consoleLogger } from './logger-shim.js';
import { getVault } from './provider-config.js';
import type { createWebuiRouteContexts } from './route-contexts.js';

type EmbeddedRouterOptions = Parameters<typeof createEmbeddedMessageRouter>[0];

export type CliEmbeddedRouterInput = Pick<
  EmbeddedRouterOptions,
  | 'trustBoundary'
  | 'send'
  | 'sendResult'
  | 'sessionPayload'
  | 'currentSessionId'
  | 'shutdown'
  | 'onDispose'
  | 'providerCtx'
  | 'kanbanHostRoutes'
> & {
  opts: CliWebUIOptions;
  routeContexts: ReturnType<typeof createWebuiRouteContexts>;
  domainHandlers: ReturnType<typeof createWebuiDomainHandlers>;
};

export function createCliEmbeddedMessageRouter(input: CliEmbeddedRouterInput) {
  const { opts, routeContexts, domainHandlers } = input;
  return createEmbeddedMessageRouter({
    jevVault: getVault(opts.globalConfigPath ?? opts.profileConfigPath),
    trustBoundary: input.trustBoundary,
    opts,
    logger: consoleLogger,
    send: input.send,
    sendResult: input.sendResult,
    sessionPayload: input.sessionPayload,
    currentSessionId: input.currentSessionId,
    shutdown: input.shutdown,
    // Auto-heal watchdog disposer — `disposeResources` awaits it (bounded) so
    // an in-flight daemon restart drains before the host exits.
    onDispose: input.onDispose,
    providerCtx: input.providerCtx,
    brainCtx: routeContexts.brainCtx,
    introspectionCtx: routeContexts.introspectionCtx,
    skillsCtx: routeContexts.skillsCtx,
    promptsCtx: routeContexts.promptsCtx,
    designCtx: routeContexts.designCtx,
    agentConfigCtx: routeContexts.agentConfigCtx,
    prefsCtx: routeContexts.prefsCtx,
    projectCtx: routeContexts.projectsCtx,
    mailboxRoutes: routeContexts.mailboxRoutes,
    chimeraRoutes: routeContexts.chimeraRoutes,
    codeAssistRoutes: routeContexts.codeAssistRoutes,
    sessionCtx: routeContexts.sessionsCtx,
    conversationCtx: routeContexts.connectionCtx,
    goalHandler: domainHandlers.goalHandler,
    specsHandler: domainHandlers.specsHandler,
    sddBoardHandler: domainHandlers.sddBoardHandler,
    sddWizardHandler: domainHandlers.sddWizardHandler,
    worktreeHandler: domainHandlers.worktreeHandler,
    terminalHandler: domainHandlers.terminalHandler,
    kanbanHostRoutes: input.kanbanHostRoutes,
    statusTracker: opts.statusTracker,
  });
}
