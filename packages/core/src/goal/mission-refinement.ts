import type { Config } from '../types/config/root.js';
import type { Provider } from '../types/provider.js';
import {
  readBundledInstructionText,
  renderInstructionTemplate,
} from '../utils/instruction-file.js';

export interface RefinedMission {
  refinedGoal: string;
  deliverables: string[];
}

export interface MissionRefinerTarget {
  provider: Provider;
  model: string;
}

/** Resolve the configured refiner profile/model against available providers. */
export function resolveRefinerTarget(
  cfg: Config,
  createProvider: ((providerId: string) => Provider | undefined) | undefined,
  activeProviderId: string,
  activeModel: string,
): MissionRefinerTarget | undefined {
  const refinerFallback = cfg.autonomy?.refinerFallbackProfile;
  if (refinerFallback) {
    for (const entry of cfg.fallbackProfiles?.[refinerFallback] ?? []) {
      const resolved = resolveProfileEntry(
        entry,
        cfg,
        createProvider,
        activeProviderId,
        activeModel,
      );
      if (resolved) return resolved;
    }
  }

  const refinerProviderId = cfg.autonomy?.refinerProvider;
  const refinerModel = cfg.autonomy?.refinerModel;
  if (!refinerProviderId && !refinerModel) return undefined;

  const model = refinerModel ?? activeModel;
  const favorites = cfg.favoriteModels ?? [];
  const isFavorite = favorites.length === 0 || favorites.includes(model);
  const isActive = model === activeModel;
  if (!isFavorite && !isActive) return undefined;

  const targetProviderId = refinerProviderId ?? activeProviderId;
  if (!createProvider) return undefined;
  const provider = createProvider(targetProviderId);
  if (!provider) return undefined;
  return { provider, model };
}

function resolveProfileEntry(
  entry: string,
  cfg: Config,
  createProvider: ((providerId: string) => Provider | undefined) | undefined,
  activeProviderId: string,
  activeModel: string,
): MissionRefinerTarget | undefined {
  if (!entry || !createProvider) return undefined;
  const slash = entry.indexOf('/');
  const providerId = slash > 0 ? entry.slice(0, slash) : activeProviderId;
  const modelId = slash > 0 ? entry.slice(slash + 1) : entry;
  const favorites = cfg.favoriteModels ?? [];
  const isFavorite = favorites.length === 0 || favorites.includes(modelId);
  const isActive = modelId === activeModel;
  if (!isFavorite && !isActive) return undefined;
  const provider = createProvider(providerId);
  if (!provider) return undefined;
  return { provider, model: modelId };
}

/** Prompt and parser shared by terminal and browser mission entry points. */
export function buildGoalRefinementPrompt(rawGoal: string): string {
  return renderInstructionTemplate(readBundledInstructionText('cli/goal-refiner.md'), { rawGoal });
}

export function parseGoalRefinement(text: string, fallbackGoal: string): RefinedMission | null {
  const refinedMatch = text.match(/REFINED_GOAL:\s*\n?([\s\S]*?)(?=\nDELIVERABLES:|$)/i);
  const deliverablesMatch = text.match(/DELIVERABLES:\s*\n([\s\S]*?)$/i);
  if (!refinedMatch && !deliverablesMatch) return null;
  const refinedGoal = refinedMatch?.[1]?.trim() || fallbackGoal;
  const deliverables = (deliverablesMatch?.[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^[\s-]*[-*]\s*/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('REFINED_GOAL'));
  return {
    refinedGoal,
    deliverables:
      deliverables.length > 0 ? deliverables : refineGoalHeuristic(refinedGoal).deliverables,
  };
}

/** A bounded, tool-free provider call for mission refinement. */
export async function refineGoalWithProvider(
  rawGoal: string,
  provider: Provider,
  model: string,
): Promise<RefinedMission | null> {
  try {
    const response = await provider.complete(
      {
        model,
        system: [{ type: 'text', text: buildGoalRefinementPrompt(rawGoal) }],
        messages: [{ role: 'user', content: 'Produce the refined goal.' }],
        maxTokens: 1000,
      },
      { signal: AbortSignal.timeout(30_000) },
    );
    const text = extractRefinementText(response);
    return text ? parseGoalRefinement(text, rawGoal) : null;
  } catch {
    return null;
  }
}

function extractRefinementText(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  if (Array.isArray(value.content)) {
    const text = (value.content as Array<{ type?: string; text?: string }>)
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    return text || null;
  }
  if (Array.isArray(value.choices)) {
    const choice = value.choices[0] as { message?: { content?: string } } | undefined;
    return choice?.message?.content ?? null;
  }
  return typeof value.text === 'string' ? value.text : null;
}

/** Fallback refinement shared by terminal and browser mission entry points. */
export function refineGoalHeuristic(rawGoal: string): {
  refinedGoal: string;
  deliverables: string[];
} {
  const refinedGoal = rawGoal.trim();
  const deliverables = refinedGoal
    .split(/[.;]\s*/)
    .map((line) => line.trim())
    .filter((line) =>
      /\b(add|build|create|fix|implement|refactor|write|remove|update|migrate|set up|configure|deploy|test|document)\b/i.test(
        line,
      ),
    );
  return {
    refinedGoal,
    deliverables: deliverables.length > 0 ? deliverables : [refinedGoal],
  };
}
