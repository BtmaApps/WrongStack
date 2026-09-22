import {
  type RefinedMission,
  refineGoalWithProvider,
  resolveRefinerTarget,
} from '@wrongstack/core/goal';
import type { Config, Provider } from '@wrongstack/core/types';

/** Bind Goal refinement to the requesting session, then follow CLI fallback order. */
export function createGoalRefinerAdapter(opts: {
  config?: Config | undefined;
  primaryProvider?: Provider | undefined;
  primaryModel?: string | undefined;
  activeProviderId?: string | undefined;
  createProvider?: ((providerId: string) => Provider | undefined) | undefined;
}): ((goal: string) => Promise<RefinedMission | null>) | undefined {
  const { config, primaryProvider, primaryModel } = opts;
  if (!primaryProvider || !primaryModel) return undefined;
  const target = config
    ? resolveRefinerTarget(
        config,
        opts.createProvider,
        opts.activeProviderId ?? config.provider ?? primaryProvider.id,
        primaryModel,
      )
    : undefined;
  return async (goal) => {
    if (target) {
      const result = await refineGoalWithProvider(goal, target.provider, target.model);
      if (result) return result;
      if (target.provider === primaryProvider && target.model === primaryModel) return null;
    }
    return refineGoalWithProvider(goal, primaryProvider, primaryModel);
  };
}
