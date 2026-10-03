import { DirectorTaskRegistry } from './director/director-task-registry.js';
import type { DirectorFleetHost, ManifestEntry } from './fleet-spawn.js';

export function createDirectorTaskRegistry(
  host: Pick<
    DirectorFleetHost,
    | 'coordinator'
    | 'stateCheckpoint'
    | 'workCompleteFlag'
    | 'fleetManager'
    | 'manifestEntries'
    | 'subagentMeta'
    | 'appendSessionEvent'
    | 'scheduleManifest'
  >,
): DirectorTaskRegistry {
  return new DirectorTaskRegistry({
    coordinator: host.coordinator,
    stateCheckpoint: host.stateCheckpoint,
    isWorkComplete: () => host.workCompleteFlag,
    dispatchableSubagentIds: () =>
      host.coordinator
        .getStatus()
        .subagents.filter((s) => s.status !== 'stopped')
        .map((s) => s.id),
    addTaskToManifest: (subagentId, taskId) => {
      if (host.fleetManager) {
        host.fleetManager.addTaskToSubagent(subagentId, taskId);
        return;
      }
      const entry = asManifestEntry(host.manifestEntries.get(subagentId));
      if (entry && !entry.taskIds.includes(taskId)) entry.taskIds.push(taskId);
    },
    recordPendingTask: (taskId, subagentId, description) =>
      host.fleetManager?.addPendingTask(taskId, subagentId, description),
    appendSessionEvent: (event) => host.appendSessionEvent(event),
    // FleetManager owns manifest state when injected. Scheduling the
    // Director's legacy writer here would race the FleetManager writer
    // against the same path with Director.manifestEntries (empty in the
    // delegated path), intermittently replacing live children with [].
    scheduleManifest: () => {
      if (host.fleetManager) {
        host.fleetManager.scheduleManifest();
      } else {
        host.scheduleManifest();
      }
    },
    getSubagentMeta: (subagentId) => host.subagentMeta.get(subagentId),
  });
}

function asManifestEntry(value: unknown): ManifestEntry {
  return value as ManifestEntry;
}
