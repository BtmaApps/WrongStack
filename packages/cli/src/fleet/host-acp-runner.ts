import { randomUUID } from 'node:crypto';
import type { Config } from '@wrongstack/core/types';
import { publishAcpLiveProgress } from './acp-live-progress.js';
import type { BuildAcpSubagentRunnerOptions } from './host-acp.js';

export interface HostAcpRunnerHost {
  deps: import('./host-types.js').MultiAgentDeps;
  getDirector: () => import('@wrongstack/core/coordination').Director | undefined;
  ensureCoordinator: (_config: import('@wrongstack/core/types').Config) => Promise<void>;
  getCoordinator: () => import('@wrongstack/core/coordination').DefaultMultiAgentCoordinator;
  buildACPRunner: (subagentId: string) => Promise<import('@wrongstack/core/types').SubagentRunner>;
  recordLearningRole: (subagentId: string, role: string, skills?: readonly string[]) => void;
  directorRunnerSet: boolean;
  sessionForSubagent: (subagentId: string) => string;
}

export function acpCommandOpts(this: HostAcpRunnerHost): BuildAcpSubagentRunnerOptions {
  let overrides: BuildAcpSubagentRunnerOptions['overrides'];
  try {
    overrides = this.deps.configStore.get()?.acp?.agents;
  } catch {
    overrides = undefined;
  }
  return {
    ...(overrides ? { overrides } : {}),
    publishLive: (ctx, task, event) => {
      publishAcpLiveProgress({
        event,
        subagentId: ctx.subagentId,
        agentName: ctx.config.name ?? ctx.config.role ?? ctx.subagentId,
        sessionId: ctx.sessionId,
        taskId: task.id,
        fleet: this.getDirector()?.fleet,
        hostEvents: this.deps.events,
      });
    },
  };
}

export async function spawnACP(
  this: HostAcpRunnerHost,
  subagentId: string,
  task: string,
  config: Config,
): Promise<string> {
  const taskId = randomUUID();
  await this.ensureCoordinator(config);
  const coordinator = this.getCoordinator();

  const acpRunner = await this.buildACPRunner(subagentId);
  this.recordLearningRole(subagentId, subagentId);
  coordinator.setRunner(acpRunner);
  this.directorRunnerSet = true;
  await coordinator.spawn({
    id: subagentId,
    name: subagentId,
    role: subagentId,
    provider: 'acp',
  });
  await coordinator.assign({
    id: taskId,
    description: task,
  });

  this.deps.events.emit('subagent.spawned', {
    // Whatever the coordinator recorded at spawn — `spawnACP` has no caller
    // context to name an origin, so this is the host session today, but the
    // announcement must not disagree with the roster the worker lands in.
    sessionId: this.sessionForSubagent(subagentId),
    subagentId,
    taskId,
    name: subagentId,
    provider: 'acp',
    model: undefined,
    description: task,
  });

  return taskId;
}
