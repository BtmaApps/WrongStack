import type { Config } from '@wrongstack/contracts/types';
import type { OneShotOrchestratorOptions } from '@wrongstack/contracts/types/one-shot-llm';
import { resolveSubagentModelTarget } from '@wrongstack/coordination';
import type { LlmCallFn } from '../triage/llm-evaluator.js';

type OneShotModule = typeof import('@wrongstack/core/execution');

const CALL_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 900;

export interface MemoryCuratorLlmDeps {
  getConfig: () => Config;
  buildProvider: OneShotOrchestratorOptions['buildProvider'];
  fallbackProfileManager: OneShotOrchestratorOptions['fallbackProfileManager'];
  statusTracker?: OneShotOrchestratorOptions['statusTracker'];
  /** The host's provider-runner chain (prompt firewall, cache, budget). */
  wrapProviderCall?: OneShotOrchestratorOptions['wrapProviderCall'];
}

/**
 * The host's LLM transport for SAGE's background passes (consolidation, the
 * daily triage). The model is the `memory-curator` route from `modelMatrix`
 * (`/setmodel memory-curator …`), resolved per call so a route change applies
 * without a restart; without a route it is the session model. Throws on
 * failure so callers can tell "no answer" from an empty one.
 */
export function createMemoryCuratorLlmCall(deps: MemoryCuratorLlmDeps): LlmCallFn {
  // Loaded on the first background call, not when the SAGE barrel is imported:
  // most processes that import SAGE never run a consolidation pass.
  let orchestrator: Promise<{ call: InstanceType<OneShotModule['OneShotOrchestrator']>['call'] }>;
  const load = () => {
    orchestrator ??= import('@wrongstack/core/execution').then(
      ({ OneShotOrchestrator }) =>
        new OneShotOrchestrator({
          buildProvider: deps.buildProvider,
          getConfig: deps.getConfig,
          fallbackProfileManager: deps.fallbackProfileManager,
          ...(deps.statusTracker ? { statusTracker: deps.statusTracker } : {}),
          ...(deps.wrapProviderCall ? { wrapProviderCall: deps.wrapProviderCall } : {}),
        }),
    );
    return orchestrator;
  };
  return async (system, userPrompt) => {
    const target = resolveSubagentModelTarget(deps.getConfig(), 'memory-curator', {
      statusTracker: deps.statusTracker as never,
    });
    const result = await (await load()).call({
      system,
      userPrompt,
      ...(target?.provider ? { providerId: target.provider } : {}),
      ...(target?.model ? { model: target.model } : {}),
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: CALL_TIMEOUT_MS,
    });
    if (result.error) throw new Error(result.error);
    return result.text;
  };
}
