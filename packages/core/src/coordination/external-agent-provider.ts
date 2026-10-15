/**
 * Providers whose "model" is an external agent with its own loop, tools and
 * usage policy: `acp` (Claude Code, Codex CLI, … over ACP) and `wrongforge`
 * (the machine's WrongForge over its task API). A worker on one of them is
 * not a WrongStack agent loop: no lane routing, no internal role budget, no
 * worktree, only an inactivity guard.
 *
 * A leaf module (no imports) so every coordination file can ask it without
 * joining an import cycle.
 */
export const EXTERNAL_AGENT_PROVIDERS: ReadonlySet<string> = new Set(['acp', 'wrongforge']);

export function isExternalAgentProvider(provider: string | undefined): boolean {
  return provider !== undefined && EXTERNAL_AGENT_PROVIDERS.has(provider);
}
