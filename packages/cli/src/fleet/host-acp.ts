import {
  type ACPProgressEvent,
  type AcpAgentCommandOverrides,
  type AcpLiveCatalog,
  type PermissionPolicy as AcpPermissionPolicy,
  type AcpSessionSetup,
  defaultPermissionPolicy,
  makeACPSubagentRunner,
  resolveAcpAgentCommand,
} from '@wrongstack/acp';
import type { Config, SubagentRunContext, SubagentRunner, TaskSpec } from '@wrongstack/core/types';
import { ToolValidationError } from '@wrongstack/core/types';
import { registerAcpSteerInbox } from './acp-live-steer.js';
import { wrongstackBridgeSetup } from './acp-wrongstack-bridge.js';

export type AcpLivePublisher = (
  ctx: SubagentRunContext,
  task: TaskSpec,
  event: ACPProgressEvent,
) => void;

export interface BuildAcpSubagentRunnerOptions {
  /**
   * The project the worker works in: its cwd and file-access root. Without it
   * the worker ran in the host process's cwd — a subdirectory, or another
   * repository than the session's.
   */
  projectRoot?: string | undefined;
  overrides?: AcpAgentCommandOverrides | undefined;
  live?: AcpLiveCatalog | undefined;
  publishLive?: AcpLivePublisher | undefined;
  /** Project the worker runs in, plus `acp.bridge` config: see acp-wrongstack-bridge.ts. */
  bridge?:
    | { projectRoot: string; config?: NonNullable<Config['acp']>['bridge'] | undefined }
    | undefined;
  /**
   * WrongStack's permission rules for the worker's session (see
   * acp-permission-bridge.ts). When set, the worker is also started in its
   * `default` mode so it asks before edits and commands, whatever mode the
   * user runs the agent in on their own.
   */
  permissions?: ((ctx: SubagentRunContext) => AcpPermissionPolicy) | undefined;
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
  const bridgeSetup = options?.bridge
    ? wrongstackBridgeSetup(subagentId, options.bridge.projectRoot, options.bridge.config)
    : undefined;
  const permissions = options?.permissions;
  const sessionSetup =
    bridgeSetup || permissions
      ? (task: TaskSpec, ctx: SubagentRunContext): AcpSessionSetup => ({
          ...bridgeSetup?.(task, ctx),
          ...(permissions ? { permissionPolicy: permissions(ctx) } : {}),
        })
      : undefined;
  const projectRoot = options?.projectRoot;
  return makeACPSubagentRunner({
    ...cmd,
    ...(projectRoot ? { cwd: projectRoot, projectRoot } : {}),
    permissionPolicy: defaultPermissionPolicy,
    ...(permissions ? { initialModeId: 'default' } : {}),
    ...(options?.publishLive ? { publishLive: options.publishLive } : {}),
    ...(sessionSetup ? { sessionSetup } : {}),
    // The leader's `session_note` to a running worker joins its turn.
    onTurnLive: (ctx, task, steer) => registerAcpSteerInbox(ctx, task, steer),
  });
}
