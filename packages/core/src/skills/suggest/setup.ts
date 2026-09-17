/**
 * Host wiring for skill suggestion.
 *
 * One setup function shared by every surface, for the same reason SAGE has
 * one: the CLI and the WebUI server install the same middleware, and a second
 * copy of the gating logic is a config-forward drift waiting to happen.
 *
 * Every precondition fails CLOSED and silently — the feature is an
 * optimization, and a surface that cannot satisfy it must run exactly as it
 * did before rather than warn on every boot.
 */

import type { Middleware } from '../../kernel/pipeline.js';
import type { Config } from '../../types/config/root.js';
import type { Logger } from '../../types/logger.js';
import type { Request } from '../../types/provider.js';
import type { SkillLoader } from '../../types/skill.js';
import { resolveTypeSafeClient, TYPESAFE_API_KEY_ENV } from '../../typesafe/index.js';
import {
  createSkillSuggestionMiddleware,
  type SkillSuggestionMiddlewareOptions,
} from './middleware.js';
import { createSkillSuggester, type SkillSuggester } from './skill-suggester.js';

// The credential and endpoint live in `config.typesafe`, shared with the
// dispatch classifier; re-exported here so existing importers keep resolving.
export { TYPESAFE_API_KEY_ENV };

export interface SkillSuggestionSetupDeps {
  config: Config;
  skillLoader: SkillLoader | undefined;
  logger?: Logger | undefined;
  getSessionId?: (() => string | undefined) | undefined;
  /** Injected for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
  onSuggestion?: SkillSuggestionMiddlewareOptions['onSuggestion'] | undefined;
}

/**
 * Build a suggester from config, or say why it could not be built.
 *
 * Split out from the middleware wiring because the `skill-suggest` subcommand
 * needs the same suggester WITHOUT the `enabled` gate and WITHOUT the silence:
 * previewing what the suggester would say is how you decide whether to turn it
 * on, so refusing to build one until it is already on would be circular. The
 * host path below keeps both the gate and the silence.
 */
export function buildSuggesterFromConfig(deps: {
  config: Config;
  skillLoader: SkillLoader | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): { suggester: SkillSuggester } | { error: string } {
  const suggest = deps.config.skills?.suggest ?? {};
  if (!deps.skillLoader) {
    return { error: 'no skill loader in this process (is `features.skills` off?)' };
  }
  const resolved = resolveTypeSafeClient({ config: deps.config, env: deps.env });
  if ('error' in resolved) return resolved;
  return {
    suggester: createSkillSuggester({
      client: resolved.client,
      loader: deps.skillLoader,
      shortlistSize: suggest.shortlistSize,
      excerptChars: suggest.excerptChars,
      gateThreshold: suggest.gateThreshold,
      fitsThreshold: suggest.fitsThreshold,
      model: deps.config.typesafe?.model,
    }),
  };
}

/**
 * Build the skill-suggestion middleware, or `undefined` when the feature is
 * off, unconfigured, or unusable in this process.
 *
 * Callers install the result on their request pipeline:
 * `const mw = createSkillSuggestionSetup(deps); if (mw) pipelines.request.use(mw);`
 */
export function createSkillSuggestionSetup(
  deps: SkillSuggestionSetupDeps,
): Middleware<Request> | undefined {
  const suggest = deps.config.skills?.suggest;
  // Opt-in: this sends the user's prompt text to a third-party service on
  // every new turn. That is a decision an operator makes explicitly, never a
  // default that arrives with an upgrade.
  if (suggest?.enabled !== true) return undefined;
  // `features.skills === false` means the roster never reaches the prompt at
  // all, so there is nothing to point at.
  if (deps.config.features.skills === false) return undefined;

  const built = buildSuggesterFromConfig(deps);
  if ('error' in built) {
    deps.logger?.debug(`skill suggestion enabled but unusable: ${built.error}`);
    return undefined;
  }

  return createSkillSuggestionMiddleware({
    suggester: built.suggester,
    getSessionId: deps.getSessionId,
    deadlineMs: suggest.deadlineMs,
    minRequestChars: suggest.minRequestChars,
    onSuggestion: (info) => {
      // A live session shows nothing: the suggestion is one line of system
      // prompt the user never sees, so an operator who turned this on has no
      // way to tell whether it is firing. A debug line is the cheapest honest
      // signal; `wstack skill-suggest "<request>"` is the full view.
      deps.logger?.debug(
        info.suggestion
          ? `skill suggestion: ${info.suggestion.name} (gate ${info.suggestion.gate.toFixed(2)}, fits ${info.suggestion.fits.toFixed(2)})`
          : 'skill suggestion: nothing fits this turn',
      );
      deps.onSuggestion?.(info);
    },
  });
}
