/**
 * Paths the contract may PUSH but must never ACCEPT on a pull.
 *
 * `CLOUD_SYNC_CONTRACT` answers "what may leave this machine". It was also the
 * gate on the inbound direction, but that is a different question — "what may a
 * remote peer write into the trusted profile config" — and reusing one answer
 * for both granted the portal `mcpServers.*.command` (→ spawn), `plugins` (→
 * `await import`), `providers.*.baseUrl` (→ endpoint redirect, with the local
 * `apiKey` deliberately preserved by `reinjectLocalSecrets`) and `yolo` (→ every
 * permission prompt off). A pull runs unattended on a timer.
 *
 * Note the asymmetry these entries restore: `in-project-policy.ts` already
 * denies this same class of field to a checked-out repository. A remote portal
 * is not more trusted than a repo the user chose to clone.
 *
 * Expressed as a denylist over the outbound tree rather than as a second full
 * tree: one source of truth, and `assertInboundDenyListResolves` fails the build
 * if an entry stops matching, so a contract rename cannot silently re-open a
 * path. Pushing these fields is still fine — that is the direction the contract
 * was designed for.
 */
export const INBOUND_DENIED_PATHS: ReadonlyArray<{
  namespace: string;
  path: string;
  reason: string;
}> = [
  // ── Code execution ──────────────────────────────────────────────────────
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.command',
    reason: 'Executable spawned for a stdio MCP server.',
  },
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.args',
    reason: 'Argv for that executable.',
  },
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.transport',
    reason: 'Switching transport to stdio selects the spawning code path.',
  },
  {
    namespace: 'extensions.plugins',
    path: 'plugins',
    reason: 'Plugin list is resolved and `await import`ed.',
  },
  // `extensions` is deliberately NOT denied: it is per-plugin settings read via
  // `ConfigStore.getExtension(name)`, not a loader list, so it grants no import.
  // Syncing it is the feature (`extensions.telegram.notifyChatId` and friends).
  // Residual risk accepted: a plugin whose own settings include a URL can have
  // that URL rewritten by the portal. Constrain that in the plugin's
  // `configSchema`, which is where the loader validates it.
  // ── Credential redirection / exfiltration ───────────────────────────────
  {
    namespace: 'providers.catalog',
    path: 'providers.*.baseUrl',
    reason:
      'Repoints the provider endpoint; reinjectLocalSecrets keeps the local apiKey, so the real key follows the redirect.',
  },
  {
    namespace: 'providers.catalog',
    path: 'providers.*.envVars',
    reason: 'Chooses which environment variable is read for the key.',
  },
  {
    namespace: 'providers.catalog',
    path: 'providers.*.activeKey',
    reason: 'Selects which stored key is sent.',
  },
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.url',
    reason: 'Remote MCP endpoint; receives whatever the transport carries.',
  },
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.envVars',
    reason: 'Names of environment variables forwarded to the server process.',
  },
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.bearerTokenEnv',
    reason: 'Chooses which local environment secret is sent to a remote MCP endpoint.',
  },
  // ── Operator-owned safety switches ──────────────────────────────────────
  {
    namespace: 'mcp.servers',
    path: 'mcpServers.*.permission',
    reason: 'Approval requirement for that server’s tools.',
  },
  { namespace: 'core.runtime', path: 'yolo', reason: 'Disables every permission prompt.' },
  {
    namespace: 'core.runtime',
    path: 'features.allowOutsideProjectRoot',
    reason: 'Short-circuits project-root containment and the symlink realpath check.',
  },
  {
    namespace: 'core.runtime',
    path: 'tools.restrictToProjectRoot',
    reason: 'The other half of the filesystem confinement switch.',
  },
  {
    namespace: 'core.runtime',
    path: 'features.developerMode',
    reason: 'Loosens guardrails; an operator opt-in, not a synced preference.',
  },
  {
    namespace: 'core.runtime',
    path: 'tools.disabledTools',
    reason: 'Could re-enable a tool the operator deliberately switched off.',
  },
  {
    namespace: 'core.runtime',
    path: 'tools.disabledToolMeta',
    reason: 'Could rewrite the disabled-tool audit trail to hide operator intent.',
  },
  {
    namespace: 'core.runtime',
    path: 'tools.autoThin',
    reason:
      'Could switch on or tune the auto-thinning pipeline without operator consent, silently disabling tools on remote pulls.',
  },
  {
    namespace: 'ui.preferences',
    path: 'autonomy.defaultMode',
    reason: 'Autonomy is user-owned, never remote-owned.',
  },
  {
    namespace: 'ui.preferences',
    path: 'autonomy.yolo',
    reason: 'Alias for the denied top-level `yolo`, and it wins over the user setting.',
  },
  {
    namespace: 'ui.preferences',
    path: 'autonomy.yoloPlus',
    reason: 'Allows every tool call with no prompt at all; never remote-owned.',
  },
  {
    namespace: 'ui.preferences',
    path: 'launch.autonomy',
    reason: 'Launch-time autonomy mode; same user-owned boundary.',
  },
  {
    namespace: 'models.routing',
    path: 'brain.mode',
    reason: 'Selects the policy/LLM/human decision ladder.',
  },
  {
    namespace: 'models.routing',
    path: 'brain.maxAutoRisk',
    reason: 'The risk ceiling below which actions proceed without asking.',
  },
];
