/**
 * Descriptor-preserving config clone, kept in a LEAF module on purpose.
 *
 * `role-skills.ts` needs this helper, and `agent-prompts.ts` reaches the project
 * agent cluster through `project-agent-identity.js`. Defining it in
 * `agent-prompts.ts` therefore closed a RUNTIME module cycle
 * (agent-prompts → project-agent-identity → project-agent-skill-layer →
 * role-skills → agent-prompts). This module imports nothing, so both sides can
 * depend on it without a back-edge. `agent-prompts.ts` re-exports it, so every
 * existing importer keeps its import path.
 */

/**
 * Copy a config and merge `extra` WITHOUT resolving a lazy `prompt`.
 *
 * A spread or a destructure reads every own enumerable key, which invokes the
 * accessor installed by `defineLazyAgentPrompt` and re-introduces exactly the
 * eager cost it exists to avoid — and `fleet.ts` spreads all 75 catalog configs
 * at module scope to attach dispatch metadata. `getOwnPropertyDescriptors`
 * copies the accessor itself rather than its value, so the clone stays lazy.
 */
export function cloneWithLazyPrompt<T extends object, E extends object>(
  config: T,
  extra: E,
): T & E {
  const clone = Object.defineProperties({}, Object.getOwnPropertyDescriptors(config));
  return Object.assign(clone, extra) as T & E;
}
