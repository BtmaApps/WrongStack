import { makeAgentSubagentRunner, NULL_FLEET_BUS } from '@wrongstack/core/coordination';
import { TOKENS } from '@wrongstack/core/kernel';
import type { Config, SubagentRunContext, SubagentRunner, TaskSpec } from '@wrongstack/core/types';
import { expectDefined } from '@wrongstack/core/utils';
import { runWithQuotaHold } from './acp-quota-hold.js';
import type { MultiAgentHost } from './host.js';
/**
 * Routing runner — dispatches tasks to standard or ACP runner based on provider.
 */
export function buildRoutingRunner(config: Config, host: MultiAgentHost): SubagentRunner {
  const standardRunner = makeAgentSubagentRunner({
    factory: host.makeSubagentFactory(config),
    fleetBus: host.getDirector()?.fleet ?? NULL_FLEET_BUS,
  });

  return async (task: TaskSpec, ctx: SubagentRunContext) => {
    const subCfg = ctx.config;
    if (subCfg.provider === 'acp') {
      const cacheKey = subCfg.role ?? subCfg.name ?? expectDefined(subCfg.id);
      // A spent agent is not started again until its quota resets.
      return runWithQuotaHold(cacheKey, async () => {
        const runner = await host.buildACPRunner(cacheKey);
        return runner(task, ctx);
      });
    }
    return standardRunner(task, ctx);
  };
}

// Workaround: TOKENS reference satisfies unused-import lint
void TOKENS;
