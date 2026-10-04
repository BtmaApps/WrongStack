import { TOKENS } from '../kernel/tokens.js';
import type { Provider } from '../types/provider.js';
import type { BuildContext, SystemPromptBuilder } from '../types/system-prompt.js';
import type { AgentInternals } from './agent-internals.js';
import { providerToolsForVariant } from './scout-tool-surface.js';

/** Keep prompt composition, provider accounting, and executable discovery aligned. */
export async function refreshAgentToolSurface(
  agent: AgentInternals,
  provider: Provider,
  model: string,
  refreshPrompt: boolean,
  forcePrompt = false,
): Promise<void> {
  const ctx = agent.ctx;
  const meta = ctx.meta ?? {};
  const tools = providerToolsForVariant(agent.tools, meta['systemPromptVariant'], meta, provider);
  const catalogTools = agent.tools.list();
  const changed = ctx.tools !== tools;
  ctx.tools = tools;
  ctx.catalogTools = catalogTools;
  if (!refreshPrompt || (!changed && !forcePrompt)) return;
  const builder = agent.container.safeResolve<SystemPromptBuilder>(TOKENS.SystemPromptBuilder);
  if (!builder) return;
  const variant = meta['systemPromptVariant'];
  const autonomy = meta['autonomy'];
  const onlineAgents = Array.isArray(meta['promptOnlineAgents'])
    ? (meta['promptOnlineAgents'] as NonNullable<BuildContext['onlineAgents']>)
    : undefined;
  ctx.systemPrompt = await builder.build({
    cwd: ctx.cwd,
    projectRoot: ctx.projectRoot,
    tools,
    catalogTools,
    provider: provider.id,
    model,
    onlineAgents,
    ...(variant === 'lite' || variant === 'pro' || variant === 'scout' || variant === 'default'
      ? { systemVariant: variant }
      : {}),
    ...(typeof autonomy === 'string' ? { autonomy } : {}),
  });
}
