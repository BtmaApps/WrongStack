# Learned Instructions for `security-scanner`

## HQ Audit Log And WebSocket Semantics

- Before flagging ordering of `seed()` in `packages/core/src/hq/commands.ts`, verify `HqCommandAuditLog` ring orientation. The invariant is ascending: `record()` appends at the tail, `recent()` uses `slice(-limit)` to return the newest window oldest→newest, and `unshift(...seeded)` of an append-ordered block preserves it; do not suggest reversing the seeded block.

- Before claiming HQ WebSocket supersede or eviction bugs in `packages/cli/src/hq-server/ws.ts`, inspect the `sameCredential` gate: only a matching credential can trigger `clients.delete` + `close(4001)` or inherit undelivered commands. The `readyState === OPEN` gate around the `4003` refusal is intentional rotated-token reconnect design; `ws.on('close')` cleanup is the primary dead-holder removal path, not the TTL sweep.

## Credential Expiry And Sweep Boundaries

- Do not call session-expiry sweep gaps in `packages/cli/src/hq-server/socket-credentials.ts` (`sweepExpiredSocketCredentials`) authorization regressions without checking independent fail-closed enforcement: cookie-auth validation in `packages/cli/src/hq-server/auth.ts` and WS upgrade age/max-age checking in `packages/cli/src/hq-server/upgrade-handler.ts`. A lingering `state.sessions` entry past expiry cannot authenticate; treat sweep coverage gaps primarily as memory hygiene.

- Confirm token material produced by `hqTokenKey` in `packages/core/src/hq/auth-store.ts` is hash-only before clearing or weakening any `hq.auth_revoked` broadcast; do not assume raw-token leakage without checking the key output.

- For expiry-sweep refactors, compare iteration/action sets before declaring no eviction regression: a widened set is safe only when it is a strict superset of the prior acted-upon set.

## Diff Review Discipline

- Always run `git status` before reviewing a security diff. A tracked importer importing an untracked new enforcement module can make the control disappear on a fresh clone even if `git diff HEAD` looks complete; require untracked helper files and their tracked importers to land together.

- When symbols or constants move out of a security guard, mechanically compare the moved constant lists against the previous revision. Use `git show <ref>:<old-path>` with `diff` on POSIX or `Compare-Object` in PowerShell, scoped to the named constant block; avoid unscoped uppercase regexes that catch sibling constant lists and inflate dropped-entry counts.

## Server-Side Authority And Enforcement Surfaces

- When an HQ credential or server-authority claim rests on client-side comments, grep server enforcement surfaces before accepting the claim: `packages/cli/src/hq-server/routes/command-handlers.ts`, `packages/cli/src/hq-server/routes/mailbox-handlers.ts`, and `packages/cli/src/hq-server/mailbox-gateway-manager.ts`. UI gating in `packages/webui-hq/src/domain/` is fail-open UX by design and is never an enforcement point.

- Verify a new `ToolCapabilities` constant through the enforcement chain, not the doc comment: the tool must declare `capabilities: [...]`; membership must be checked in `WIDE_SUBAGENT_CAPABILITIES` and `DANGEROUS_FOR_SUBAGENTS` in `packages/core/src/security/capabilities.ts`; and `AutoApprovePermissionPolicy.evaluate` in `packages/core/src/security/auto-approve-policy.ts` must deny tools with no intersecting subagent grant. Remember `.some()` semantics: a tool passes if any declared capability is allowed, so adding capabilities can weaken single-purpose restrictions.

- For provider endpoint credential suppression, verify all enforcement surfaces together: writer behavior in `packages/core/src/tools/fallback-provider-manage-tool.ts` (`envVars: []` on add with baseUrl and on `endpointChanged` update), resolver behavior in `packages/providers/src/index.ts` (`Array.isArray(cfg.envVars) ? cfg.envVars : preset`), native SDK fail-closed throw in `packages/providers/src/catalog-provider-routing.ts`, and host primary-key inheritance in `packages/cli/src/wiring/provider-runtime.ts` and `packages/webui-server/src/server/backend-services.ts`.

- When a security enforcement helper is “single-sourced” but also inlined for mock-heavy suites, mechanically diff the inline predicates against the helper. For endpoint credentials, compare inlined logic in `packages/cli/src/wiring/provider-runtime.ts` and `packages/webui-server/src/server/backend-services.ts` against `endpointCredentialsSuppressed` in `packages/providers/src/endpoint-credentials.ts`; multiple copies of one predicate are a drift surface.

## Shell Permission And YOLO Risk

- Ensure shell-surface destructive classification uses `classifyShellSurfaceInput` in `packages/core/src/security/permission-helpers.ts`, not `shellCommandLineFromInput`. The string-only path misses top-level and nested `{program, args}` shapes such as `criteria[].command` and `checks[]`, which is the known destructive-command classification bypass class.

- When adding or changing security gates that read command lines, grep for `shellCommandLineFromInput` consumers and migrate or justify each one before calling the review clean.

- When reviewing a fail-closed classification fallback, identify which `DestructiveKind` it returns and whether that kind is in `LOCKED_DESTRUCTIVE_KINDS` in `packages/core/src/security/yolo-risk.ts`. The walk-truncation fallback in `classifyShellSurfaceInput` returns `download-and-run`, so its guarantee depends on the user’s `yoloConfirmKinds`; verify that `normalizeYoloConfirmKinds(undefined)` yields all kinds before calling the default effective.

- In `packages/core/src/security/permission-policy.ts`, keep the session-override deny path independent from the allow path. Restricted mode, driven by `isYoloLockedOff()` from `packages/core/src/security/process-lockdown.ts` and production-wired at `packages/cli/src/boot/restricted-mode.ts`, must suppress session allows while still denying; do not collapse both behaviors through one gate because it weakens `--restricted`.

## Security Test Reliability

- Do not write short-lived credential test fixtures, such as `expiresAt = Date.now() + 1500`, before slow setup like `await startHqServer()`. Startup latency can consume the validity window and make the expiry control under test reject the wrong assertion. Start the server first, then write the fixture, and size the pre-assertion window to exceed measured setup latency.

- If a security test fails only in a full-suite run but passes with a `-t` filter, suspect a setup-latency race. Verify with one scoped rerun before reporting a product regression.

## Terminal Output And Prompt Firewall

- Check every render sink for `sanitizeTerminalText` from `packages/tui/src/terminal-width.ts` before declaring a TUI surface safe. The sanitizer strips OSC/DCS/CSI/C1 sequences, but flat-fallback paths and slash-command message strings commonly bypass it. Audit known sites such as `confirm-prompt.tsx` flat diff fallback, `shell-command-warning.tsx`, `kill-slash.ts`, and `ps-slash.ts`; grep the sinks, not the sanitizer, for coverage.

- In WrongStack’s TUI, do not log diagnostics from React error boundaries through `console.error`; use `silenceTerminal()` in `packages/tui/src/terminal-silence.ts` to suppress terminal-state corruption.

- For prompt-firewall leak paths, audit the detection/redaction scope mismatch rather than only pattern quality. `collectText()` in `packages/plugins/src/prompt-firewall/secret-detection.ts` scans only `request.system` plus `request.messages`, while `wrapProviderRunner` in `packages/plugins/src/prompt-firewall/index.ts` redacts only when a detection fires. Credentials in non-message request fields, such as `tools[].description`, bypass both in `redact`; extend `collectText()` coverage to all string-bearing request fields when closing this gap.

## MCP SSRF Posture

- Distinguish WrongStack’s two SSRF check tiers when reviewing MCP transport posture. `validateTransportUrl` in `packages/mcp/src/transport-security.ts` is syntactic and hostname-based for admin-configured URLs, while `assertNotPrivate` in the fetch tool path is resolution-bound. Reuse the resolution-bound pattern at MCP transport connect time; do not introduce a third tier.

## Coordination, Encryption, Memory, And SQLite Safety

- Require effective encryption before any sync write. `packages/core/src/plugins/sync-plugin.ts` must reject missing or no-op encryption before writing `sync.json`. Pass the host vault to built-in plugins through the top-level plugin API config in `packages/cli/src/wiring/plugins.ts`.

- Guard permanent-memory deletion in `updateSage()` by checking both the persisted state and `input.persistence`. A request such as `{ persistence: 'permanent', status: 'deleted' }` must not bypass an existing-state-only deletion check. Every forced deletion in `packages/sage/src/sqlite-store.ts` must be recorded in the audit log with the force decision and persistence class.

- In `packages/sage/src/sqlite-store.ts`, always `await this.initialize()` before calling `runMutation()` from public methods. The mutation queue immediately consumes `this.db`; without initialization, first-operation APIs fail at transaction startup instead of returning their documented domain result, masking the real error.

- Decode multi-row SAGE SQLite query results through `sqliteRowsToMemories` from `packages/sage/src/sqlite-store-search-helpers.ts`. Its per-row exception handling prevents one malformed persisted JSON record from crashing listing, audience-retrieval, search, or verification surfaces.

- Keep the `removedEdges` count predicate aligned with `cascadeDeleteEdges` in `packages/sage/src/sqlite-store.ts`. Both must exclude `related_to` structural edges, which are deliberately preserved during memory deletion.

- Use `runMutation` as the only transaction boundary for SQLite hygiene deduplication. Emit `memory.hygiene_dedup` only after that transaction commits.

- Include normalized audience identity in `SqliteSageStore.hygiene()` deduplication keys. Persist enabled anchor-verification results through `runMutation`; `verify: false` must perform no verification writes.

- Keep the TechStack SQLite loader’s narrowly filtered `process.emitWarning` shim active across both lazy `node:sqlite` loading and `DatabaseSync` construction, restoring the original function in `finally`. Store parent paths must use `node:path.dirname`.

- When testing `CompactionSummaryCache`, reset `defaultCompactionSummaryCache` in `beforeEach`. Empty or whitespace-only summaries and the `(empty)` / `(empty summary)` sentinels are excluded from caching, and successful values retain their original formatting. Race tests should explicitly invoke two same-key `getOrCreate` calls concurrently.