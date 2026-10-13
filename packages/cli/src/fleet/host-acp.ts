import {
  type ACPProgressEvent,
  type AcpAgentCommandOverrides,
  type AcpLiveCatalog,
  defaultPermissionPolicy,
  makeACPSubagentRunner,
  resolveAcpAgentCommand,
} from '@wrongstack/acp';
import type { Config, SubagentRunContext, SubagentRunner, TaskSpec } from '@wrongstack/core/types';
import { ToolValidationError } from '@wrongstack/core/types';
import { wrongstackBridgeSetup } from './acp-wrongstack-bridge.js';

export type AcpLivePublisher = (
  ctx: SubagentRunContext,
  task: TaskSpec,
  event: ACPProgressEvent,
) => void;

export interface BuildAcpSubagentRunnerOptions {
  overrides?: AcpAgentCommandOverrides | undefined;
  live?: AcpLiveCatalog | undefined;
  publishLive?: AcpLivePublisher | undefined;
  /** Project the worker runs in, plus `acp.bridge` config: see acp-wrongstack-bridge.ts. */
  bridge?:
    | { projectRoot: string; config?: NonNullable<Config['acp']>['bridge'] | undefined }
    | undefined;
}

/**
 * Same command resolution as `wstack acp spawn` / `/acp` — user override,
 * bundled catalog, synced registry, then the legacy map. Director / `--bg`
 * must not use a different argv than the CLI spawn path.
 */
export function buildAcpSubagentRunner(
  subagentId: string,
  options?: BuildAcpSubagentRunnerOptions,
): Promise<SubagentRunner> {
  const cmd = resolveAcpAgentCommand(subagentId, options?.overrides, options?.live);
  if (!cmd) {
    throw new ToolValidationError({
      message: `Unknown ACP agent: ${subagentId}`,
      field: 'subagentId',
      context: { requested: subagentId },
    });
  }
  // CLI /spawn and Director fan-out are trusted local agents (see
  // host-acp-runner-cache.ts) — pass the auto-approve policy explicitly.
  // Without it ACPSession falls back to readOnlyPermissionPolicy and
  // denies every file write / command the subagent requests.
  const sessionSetup = options?.bridge
    ? wrongstackBridgeSetup(subagentId, options.bridge.projectRoot, options.bridge.config)
    : undefined;
  return makeACPSubagentRunner({
    ...cmd,
    permissionPolicy: defaultPermissionPolicy,
    ...(options?.publishLive ? { publishLive: options.publishLive } : {}),
    ...(sessionSetup ? { sessionSetup } : {}),
  });
}
