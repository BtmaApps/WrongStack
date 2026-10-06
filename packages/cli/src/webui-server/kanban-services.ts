/** Kanban run mirror + supervisor for the CLI-embedded WebUI host (only when a project root is known). */

import { startSharedHeapWatchdog } from '@wrongstack/core/utils';
import type { CliWebUIOptions } from '../webui-server-options.js';
import { createKanbanRunMirror } from './kanban-run-mirror.js';
import { createKanbanSupervisor } from './kanban-supervisor.js';
import { consoleLogger } from './logger-shim.js';
import type { WebuiTransport } from './transport.js';

export function createWebuiKanbanServices(
  opts: CliWebUIOptions,
  broadcast: WebuiTransport['broadcast'],
) {
  const kanbanRunMirror = opts.projectRoot
    ? createKanbanRunMirror({
        projectRoot: opts.projectRoot,
        events: opts.events,
        broadcast,
        log: (m) => consoleLogger.info(m),
      })
    : null;
  const kanbanSupervisor = opts.projectRoot
    ? createKanbanSupervisor({
        projectRoot: opts.projectRoot,
        broadcast,
        ...(opts.onKanbanDispatch ? { dispatchTask: opts.onKanbanDispatch } : {}),
        log: (message) => consoleLogger.info(message),
      })
    : null;
  const stopKanbanSupervisorMemoryStats = kanbanSupervisor
    ? startSharedHeapWatchdog({
        collectStats: () => {
          const stats = kanbanSupervisor.getStats();
          return {
            kanbanSupervisorSnapshots: stats.snapshots,
            kanbanSupervisorScheduledBoards: stats.scheduledBoards,
            kanbanSupervisorAgentCooldowns: stats.agentCooldowns,
            kanbanSupervisorRunningAgents: stats.runningAgents,
          };
        },
      })
    : undefined;
  return { kanbanRunMirror, kanbanSupervisor, stopKanbanSupervisorMemoryStats };
}
