/**
 * Classifier for the smart agent dispatcher.
 *
 * Two implementations behind one seam:
 *
 *   - `makeTypeSafeDispatchClassifier` — one typed `Choice` over the candidate
 *     roles plus a `Noul` that can decline. Used when `fleet.dispatch
 *     .typesafeClassifier` is on and a `typesafe` account resolves.
 *   - `makeLLMClassifier` — the historical path: render a prompt, ask the
 *     session provider for prose, regex out the first `{...}`. Still the
 *     default, and still the fallback when TypeSafe is unconfigured.
 *
 * Either way the dispatcher only reaches a classifier when its keyword
 * heuristic is ambiguous, so this runs on a minority of dispatches.
 */

import type { DispatchClassifier } from '@wrongstack/core/coordination';
import { makeLLMClassifier, makeTypeSafeDispatchClassifier } from '@wrongstack/core/coordination';
import type { Config } from '@wrongstack/core/types';
import { resolveTypeSafeClient } from '@wrongstack/core/typesafe';
import type { CommitLLMProvider } from './commit-message.js';

/**
 * Wrap the session provider in the `complete(prompt) => text` shape
 * `makeLLMClassifier` expects. Mirrors `generateCommitMessageWithLLM`.
 */
export function makeProviderClassifier(
  provider: CommitLLMProvider,
  model: string,
): DispatchClassifier {
  return makeLLMClassifier(async (prompt: string): Promise<string> => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const resp = await provider.complete(
        {
          model,
          system: [
            {
              type: 'text',
              text:
                'You are an agent router. Choose the single best agent for the task. ' +
                'Reply with ONLY a compact JSON object {"role":"...","reason":"..."}.',
            },
          ],
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          maxTokens: 120,
          temperature: 0,
        },
        { signal: ctrl.signal },
      );
      const content = resp.content;
      return Array.isArray(content) ? (content[0]?.text ?? '') : '';
    } catch {
      return '';
    } finally {
      clearTimeout(timeout);
    }
  });
}

/**
 * Pick the classifier this config asks for.
 *
 * Falls back to the provider classifier — never to nothing — when TypeSafe is
 * requested but unconfigured. A missing API key is a setup problem, not a
 * reason to lose the routing the user already had.
 */
export function makeDispatchClassifier(deps: {
  config: Config;
  provider: CommitLLMProvider;
  model: string;
  env?: NodeJS.ProcessEnv | undefined;
}): DispatchClassifier {
  const dispatch = deps.config.fleet?.dispatch;
  if (dispatch?.typesafeClassifier === true) {
    const resolved = resolveTypeSafeClient({ config: deps.config, env: deps.env });
    if ('client' in resolved) {
      return makeTypeSafeDispatchClassifier({
        client: resolved.client,
        model: deps.config.typesafe?.model,
        fitThreshold: dispatch.fitThreshold,
        minConfidence: dispatch.minConfidence,
      });
    }
  }
  return makeProviderClassifier(deps.provider, deps.model);
}
