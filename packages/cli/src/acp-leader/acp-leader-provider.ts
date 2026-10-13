/**
 * An ACP agent (Claude Code) as the session's leader — docs/plans/acp-leader-mode.md.
 *
 * Picked like a model: `--provider acp --model claude-code`. The leader's loop
 * stays WrongStack's: each leader turn is one `stream()` call, which becomes
 * one turn of a persistent agent session (one per WrongStack session) and
 * streams the agent's reply back as text. The agent runs its own tools, so the
 * stream never carries `tool_use` and every turn ends after one iteration;
 * the loop, history, sessions, accounting and interrupts work unchanged.
 *
 * Only the leader's own turns reach the agent. Side requests (`complete()`:
 * titles, summaries, next-step suggestions, the refiner) and a WrongStack
 * subagent that inherits the leader's model (a request whose thread is not
 * the owning conversation) go to `acp.leader.sideModel`: sent to the agent,
 * they would arrive in the user's session as prompts.
 *
 * `@wrongstack/acp` is loaded on first use: it must stay off the boot graph.
 */
import type { ACPProgressEvent, ACPSession } from '@wrongstack/acp';
import type {
  Capabilities,
  Config,
  Provider,
  ProviderFactory,
  Request,
  Response,
  StreamEvent,
  SubagentRunContext,
} from '@wrongstack/core/types';
import { ProviderError } from '@wrongstack/core/types';
import { subjectForToolInput } from '@wrongstack/core/utils';
import { isRestrictedMode } from '../boot/restricted-mode.js';
import { wrongstackAcpPermissionPolicy } from '../fleet/acp-permission-bridge.js';
import { recordAcpRateLimit } from '../fleet/acp-quota-reading.js';
import { wrongstackBridgeSetup } from '../fleet/acp-wrongstack-bridge.js';
import {
  FLEET_SERVER_NAME,
  type FleetEndpoint,
  fleetNote,
  fleetToolName,
  startFleetEndpoint,
} from './acp-leader-fleet.js';
import { acpLeaderHost, trackAcpLeader } from './acp-leader-host.js';
import {
  agentTurnError,
  latestUserText,
  StreamQueue,
  TextBlocks,
  ToolCardRelay,
  turnStopReason,
  turnUsage,
} from './acp-leader-stream.js';

export const ACP_LEADER_PROVIDER_ID = 'acp';

const CAPABILITIES: Capabilities = {
  tools: true,
  parallelTools: false,
  vision: false,
  streaming: true,
  promptCache: false,
  systemPrompt: true,
  jsonMode: false,
  reasoning: false,
  maxContext: 200_000,
  maxOutput: 32_000,
  cacheControl: 'none',
  topK: false,
  frequencyPenalty: false,
  presencePenalty: false,
  seed: false,
  structuredOutput: false,
  logprobs: false,
  audio: false,
  multipleCompletions: false,
};

type AcpModule = typeof import('@wrongstack/acp');

interface LeaderSession {
  agentId: string;
  session: ACPSession;
}

/** `provider/model` → its parts; a bare id or the ACP provider itself is unusable here. */
function parseSideModel(ref: string | undefined): { provider: string; model: string } | undefined {
  const slash = ref?.indexOf('/') ?? -1;
  if (!ref || slash <= 0 || slash === ref.length - 1) return undefined;
  const provider = ref.slice(0, slash);
  if (provider === ACP_LEADER_PROVIDER_ID) return undefined;
  return { provider, model: ref.slice(slash + 1) };
}

export function leaderSideModel(config: Config): { provider: string; model: string } | undefined {
  return (
    parseSideModel(config.acp?.leader?.sideModel) ??
    parseSideModel(config.fallbackBridge) ??
    parseSideModel(config.fallbackModels?.[0])
  );
}

/** A leader turn: the request's thread is its own conversation (a subagent's is not). */
export function isLeaderTurn(req: Request): boolean {
  const { sessionId, threadId } = req.cache ?? {};
  return !sessionId || !threadId || sessionId === threadId;
}

export interface AcpLeaderProviderOptions {
  id?: string | undefined;
  /** The config at boot; the bound host's live config wins once available. */
  bootConfig: Config;
  /** Build a WrongStack provider by id, for side requests. */
  buildProvider(providerId: string, config: Config): Provider | undefined;
}

export class AcpLeaderProvider implements Provider {
  readonly id: string;
  readonly capabilities = CAPABILITIES;
  private acp: AcpModule | undefined;
  private readonly sessions = new Map<string, Promise<LeaderSession>>();
  private readonly sideProviders = new Map<string, Provider>();
  /** The fleet tools endpoint, started with the first agent session. */
  private fleet: Promise<FleetEndpoint | undefined> | undefined;

  constructor(private readonly opts: AcpLeaderProviderOptions) {
    this.id = opts.id ?? ACP_LEADER_PROVIDER_ID;
    trackAcpLeader(this);
  }

  private config(): Config {
    return acpLeaderHost()?.getConfig() ?? this.opts.bootConfig;
  }

  /** The WrongStack provider and request for anything that is not a leader turn. */
  private side(req: Request): { provider: Provider; req: Request } {
    const ref = leaderSideModel(this.config());
    let provider = ref ? this.sideProviders.get(ref.provider) : undefined;
    if (ref && !provider) {
      provider = this.opts.buildProvider(ref.provider, this.config());
      if (provider) this.sideProviders.set(ref.provider, provider);
    }
    if (!ref || !provider) {
      throw new ProviderError(
        'The ACP leader answers only its own turns. Set acp.leader.sideModel (provider/model) ' +
          'for side requests such as titles, summaries and WrongStack subagents.',
        400,
        false,
        this.id,
        { kind: 'invalid_request' },
      );
    }
    return { provider, req: { ...req, model: ref.model } };
  }

  async complete(req: Request, opts: { signal: AbortSignal }): Promise<Response> {
    const side = this.side(req);
    return side.provider.complete(side.req, opts);
  }

  async *stream(req: Request, opts: { signal: AbortSignal }): AsyncIterable<StreamEvent> {
    if (!isLeaderTurn(req)) {
      const side = this.side(req);
      yield* side.provider.stream(side.req, opts);
      return;
    }
    const agentId = req.model;
    const key = req.cache?.sessionId ?? 'default';
    const acp = await this.loadAcp();
    const leader = await this.sessionFor(key, agentId);

    const queue = new StreamQueue();
    const blocks = new TextBlocks(queue);
    const host = acpLeaderHost();
    const tools = new ToolCardRelay(host?.events, {
      sessionId: req.cache?.sessionId,
      model: agentId,
    });
    const onProgress = (event: ACPProgressEvent): void => {
      switch (event.type) {
        case 'message':
          blocks.text(event.text);
          return;
        case 'tool_call':
        case 'tool_call_update':
          tools.update(event.toolCall);
          return;
        case 'rate_limit':
          recordAcpRateLimit(agentId, event.info);
          return;
        default:
          return;
      }
    };

    yield { type: 'message_start', model: agentId };
    const turn = leader.session
      .prompt([acp.textContent(latestUserText(req.messages))], opts.signal, onProgress)
      .then(
        (result) => {
          blocks.close();
          queue.push({
            type: 'message_stop',
            stopReason: turnStopReason(result),
            usage: turnUsage(result),
          });
          queue.end();
        },
        (err: unknown) => {
          blocks.close();
          const { error, dead } = agentTurnError(err, agentId, acp.classifyAgentFailure);
          if (dead) this.drop(key, leader);
          queue.fail(error);
        },
      );
    try {
      yield* queue.drain();
    } finally {
      await turn;
    }
  }

  private async loadAcp(): Promise<AcpModule> {
    this.acp ??= await import('@wrongstack/acp');
    return this.acp;
  }

  private drop(key: string, leader: LeaderSession): void {
    this.sessions.delete(key);
    void leader.session.close().catch(() => {});
  }

  /** The persistent agent session for this conversation, started on first use. */
  private sessionFor(key: string, agentId: string): Promise<LeaderSession> {
    const existing = this.sessions.get(key);
    if (existing) {
      return existing.then((leader) => {
        if (leader.agentId === agentId) return leader;
        // `/model acp/<other agent>` mid-session: a different agent, a new session.
        this.drop(key, leader);
        return this.sessionFor(key, agentId);
      });
    }
    const starting = this.startSession(agentId);
    this.sessions.set(key, starting);
    starting.catch(() => {
      if (this.sessions.get(key) === starting) this.sessions.delete(key);
    });
    return starting;
  }

  private async startSession(agentId: string): Promise<LeaderSession> {
    const acp = await this.loadAcp();
    const config = this.config();
    const host = acpLeaderHost();
    const projectRoot = host?.projectRoot ?? process.cwd();
    const cmd = acp.resolveAcpAgentCommand(agentId, config.acp?.agents);
    if (!cmd) {
      throw new ProviderError(
        `Unknown ACP agent "${agentId}". Run /acp to see the agents installed here.`,
        400,
        false,
        this.id,
        { kind: 'invalid_request' },
      );
    }
    // The bridge's MCP servers and the leader note. The bridge builds them for
    // a fleet run; the leader has no task or budget, only an identity.
    const leaderCtx = {
      subagentId: 'leader',
      config: { id: 'leader', name: agentId, role: 'leader' },
    } as unknown as SubagentRunContext;
    const setup = wrongstackBridgeSetup(
      agentId,
      projectRoot,
      config.acp?.bridge,
      'leader',
    )?.({ id: 'leader', description: '' }, leaderCtx);
    if (host && !this.fleet) this.fleet = startFleetEndpoint(host).catch(() => undefined);
    const fleet = host ? await this.fleet : undefined;
    const mcpServers = [
      ...(setup?.mcpServers ?? []),
      ...(fleet
        ? [
            {
              type: 'http' as const,
              name: FLEET_SERVER_NAME,
              url: fleet.url,
              headers: [{ name: 'Authorization', value: `Bearer ${fleet.token}` }],
            },
          ]
        : []),
    ];
    const meta = setup?.meta as { systemPrompt?: { append?: string } } | undefined;
    const sessionMeta =
      meta?.systemPrompt?.append !== undefined
        ? {
            ...meta,
            systemPrompt: {
              ...meta.systemPrompt,
              append: meta.systemPrompt.append + (fleet ? `\n${fleetNote(fleet.tools)}` : ''),
            },
          }
        : meta;
    const permissionPolicy = host
      ? wrongstackAcpPermissionPolicy({
          evaluate: (tool, input) => host.permission().evaluate(tool, input, host.context()),
          // A fleet tool is decided as the leader tool it runs, not as an MCP proxy.
          getTool: (name) => host.getTool(fleetToolName(name) ?? name),
          projectRoot,
          allowMcp: !isRestrictedMode({}),
          ...(host.confirmAwaiter
            ? {
                confirm: async (tool, call) => {
                  const answer = await host.confirmAwaiter?.(
                    tool,
                    call.input,
                    `acp-${Date.now()}`,
                    subjectForToolInput(
                      tool.name,
                      call.input,
                      tool.subjectKey,
                      tool.subjectFields,
                    ) ?? tool.name,
                  );
                  return answer !== undefined && answer !== 'no' && answer !== 'deny';
                },
              }
            : {}),
        })
      : undefined;
    const session = await acp.ACPSession.start({
      command: cmd.command,
      ...(cmd.args ? { args: cmd.args } : {}),
      ...(cmd.env ? { env: cmd.env } : {}),
      cwd: projectRoot,
      projectRoot,
      role: agentId,
      ...(permissionPolicy ? { permissionPolicy } : {}),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      ...(sessionMeta ? { sessionMeta } : {}),
      // Claude asks before edits and commands only in `default`.
      ...(permissionPolicy
        ? { initialModeId: 'default', requireInitialMode: agentId === 'claude-code' }
        : {}),
    });
    return { agentId, session };
  }

  /** Close every agent session (process shutdown). */
  async closeAll(): Promise<void> {
    const all = [...this.sessions.values()];
    this.sessions.clear();
    const fleet = this.fleet;
    this.fleet = undefined;
    void fleet?.then((endpoint) => endpoint?.close()).catch(() => undefined);
    await Promise.all(
      all.map((p) =>
        p.then((leader) => leader.session.close({ graceMs: 500 })).catch(() => undefined),
      ),
    );
  }
}

/**
 * Registered with the provider registry at boot. Inert unless the leader
 * names it (`--provider acp`, `/model acp/claude-code`).
 */
export function createAcpLeaderProviderFactory(
  opts: Omit<AcpLeaderProviderOptions, 'id'>,
): ProviderFactory {
  return {
    type: ACP_LEADER_PROVIDER_ID,
    // Routing metadata only: the provider does no wire conversion.
    family: 'openai-compatible',
    create: (cfg) =>
      new AcpLeaderProvider({
        ...opts,
        id: (cfg as { type?: string }).type || ACP_LEADER_PROVIDER_ID,
      }),
  };
}
