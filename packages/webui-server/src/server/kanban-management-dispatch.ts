import { randomUUID } from 'node:crypto';
import { fallbackProfileChain, parseModelRef } from '@wrongstack/core/agent';
import { resolveTier } from '@wrongstack/core/coordination';
import { stripFrontmatter } from '@wrongstack/core/skills';
import { makeLightSubagentFactory } from '@wrongstack/runtime';
import type { KanbanSupervisorDeps } from './kanban-supervisor.js';
import type { WebuiDeps, WebuiMutableState } from './routes.js';

/** Standalone WebUI uses the same isolated factory as its SDD workers. */
export function createManagementDispatcher(
  deps: WebuiDeps,
  state: WebuiMutableState,
): NonNullable<KanbanSupervisorDeps['dispatchTask']> {
  return async (description, options) => {
    const root = state.getProjectRoot();
    if (options?.context?.kanban?.projectRoot !== root)
      throw new Error('Kanban management workspace changed.');
    const sessionId = options.context?.sessionId;
    const owner = (sessionId ? deps.peekAgent?.(sessionId) : undefined) ?? deps.agent;
    const factory = makeLightSubagentFactory({
      container: deps.container,
      providerRegistry: deps.providerRegistry,
      toolRegistry: deps.toolRegistry,
      modelsRegistry: deps.modelsRegistry,
      session: owner.ctx.session,
      projectRoot: root,
      cwd: root,
    });
    const config = state.getConfig();
    const chain = options.fallbackProfile
      ? fallbackProfileChain(config, options.fallbackProfile)
      : [];
    const primary = chain[0] ? parseModelRef(chain[0]) : undefined;
    const tier = options.tier ? resolveTier(config, { tier: options.tier }) : undefined;
    const id = `kanban-manager-${randomUUID()}`;
    let prompt = description;
    for (const skill of options.skills ?? []) {
      if (!deps.skillLoader) continue;
      const manifest = await deps.skillLoader.find(skill);
      if (!manifest) continue;
      if (manifest.requiredTools?.some((tool) => !(options.tools ?? []).includes(tool))) continue;
      prompt += `\n\n## Skill: ${skill}\n${stripFrontmatter(await deps.skillLoader.readBody(skill))}`;
    }
    void (async () => {
      let built: Awaited<ReturnType<typeof factory>> | undefined;
      let outcome: Parameters<NonNullable<NonNullable<typeof options>['onDone']>>[0];
      try {
        if (options.signal?.aborted) throw new Error('Kanban manager cancelled.');
        built = await factory({
          id,
          name: options.name ?? id,
          role: 'kanban-agent',
          prompt,
          tools: options.tools ?? ['kanban', 'read', 'grep', 'glob', 'tree'],
          provider: primary?.provider ?? options.provider ?? tier?.provider ?? config.provider,
          model: primary?.model ?? options.model ?? tier?.model ?? owner.ctx.model,
          fallbackModels:
            options.fallbackModels ??
            (chain.length ? chain.slice(1) : tier?.fallbackModels?.slice()),
        });
        built.agent.ctx.meta['kanban'] = options.context?.kanban;
        if (sessionId) built.agent.ctx.meta['sessionId'] = sessionId;
        if (options.signal?.aborted) throw new Error('Kanban manager cancelled.');
        const result = await built.agent.run(prompt, { signal: options.signal });
        outcome = {
          status: result.status === 'done' ? 'completed' : 'failed',
          result: result.finalText,
        };
      } catch (error) {
        outcome = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        try {
          await built?.dispose?.();
        } catch (error) {
          deps.logger.warn?.(`Kanban manager cleanup: ${String(error)}`);
        }
      }
      await options.onDone?.(outcome);
    })().catch((error) => deps.logger.warn?.(`Kanban manager: ${String(error)}`));
    return `Started Kanban task manager ${id}.`;
  };
}
