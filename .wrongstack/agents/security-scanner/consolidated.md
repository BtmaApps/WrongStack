# Security Scanner Instructions

## Review Discipline

- Run `git status` before reviewing a security diff. Tracked importers and untracked enforcement modules must land together; `git diff HEAD` alone can hide missing controls.
- Mechanically compare moved security constants or duplicated predicates against their source using scoped `git show <ref>:<path>` and `diff` or PowerShell `Compare-Object`; avoid broad uppercase-symbol searches.
- Establish server-side enforcement before accepting client comments or UI gating as authority.

## Shell Permissions and Destructive Classification

- Use `classifyShellSurfaceInput` in `packages/core/src/security/permission-helpers.ts`, not `shellCommandLineFromInput`, for destructive classification: string-only extraction misses nested `{program, args}` inputs. Audit remaining `shellCommandLineFromInput` consumers when changing command gates.
- Widening `HALT_LAUNCHER_PREFIX` token skipping before the verb tightens `SYSTEM_HALT_COMMAND` detection. Before alleging ReDoS or parse forks, check alternative first-character disjointness: flags start with `-`, assignments with `[A-Za-z_]`, and numeric operands with a digit or `.`.
- For launcher numeric changes, grep `(?:\d+(?:\.\d*)?|\.\d+)[smhd]?` across `packages/core/src/security/yolo-risk.ts`, `packages/tools/src/_danger-detect.ts` (`TIMEOUT_DURATION`), and `packages/plugins/src/dep-guard/index.ts`; require fractional-duration coverage in `packages/core/tests/security/yolo-risk.test.ts`, because `packages/tools/tests/danger-detect.test.ts` pins only `HALT_LAUNCHER_VALUE_FLAGS` parity.
- Verify fallback kinds against `LOCKED_DESTRUCTIVE_KINDS` in `packages/core/src/security/yolo-risk.ts`. `classifyShellSurfaceInput` truncation returns `download-and-run`; its protection depends on `yoloConfirmKinds`, whose undefined normalization must include all kinds.
- In `packages/core/src/security/permission-policy.ts`, keep session denies independent of session allows. `isYoloLockedOff()` from `packages/core/src/security/process-lockdown.ts`, wired through `packages/cli/src/boot/restricted-mode.ts`, must suppress allows without suppressing denies.

## Secret Scrubbing and Caching

- In `packages/core/src/security/secret-scrubber.ts`, exclude capturing-group patterns from `SIMPLE_PATTERNS`, require each `anchor` to occur in every match, recognize that `COMBINED_REPLACEMENTS` and `PATTERN_ANCHORS`/`ALL_ANCHORS` are table-derived, and verify dedicated passes reach both object walkers through `scrub()`; run `pnpm exec vitest run <test-file>` from `packages/core`, not the workspace `test` tool.
- When `scrubObjectShared` in `packages/core/src/security/secret-scrubber.ts` detects a cycle, discard partial output and unconditionally invoke the full cycle-aware copier rather than returning raw back-edges.
- Compare old and new scrubbers in `packages/core/src/security/secret-scrubber.ts` on aliased and cyclic graphs; revisit guards must not expose original nodes, and leak assertions must traverse with a `Set` rather than cyclic-unsafe `JSON.stringify`.
- Preserve `Object.defineProperty(out, k, { value, enumerable: true, writable: true, configurable: true })` in both walkers in `packages/core/src/security/secret-scrubber.ts`; assigning untrusted `__proto__` keys via `out[k] = value` mutates the prototype and loses the property.
- In `packages/persistence/src/ipc-endpoint-secret.ts`, compare every reader return with the cache sentinel: `secret !== undefined` still memoizes `null` failures such as ENOENT or invalid content, potentially pinning fail-open behavior; test each failure separately.

## Credentials and Server Authority

- For HQ authority claims, inspect `packages/cli/src/hq-server/routes/command-handlers.ts`, `packages/cli/src/hq-server/routes/mailbox-handlers.ts`, and `packages/cli/src/hq-server/mailbox-gateway-manager.ts`; `packages/webui-hq/src/domain/` gating is UX, not enforcement.
- Before reporting expiry-sweep authorization gaps in `packages/cli/src/hq-server/socket-credentials.ts`, check independent fail-closed validation in `packages/cli/src/hq-server/auth.ts` and `packages/cli/src/hq-server/upgrade-handler.ts`. Expired retained sessions can be memory hygiene rather than authentication bypasses.
- In `packages/cli/src/hq-server/ws.ts`, inspect `sameCredential` before alleging supersede, eviction, or undelivered-command leakage. The OPEN-state `4003` refusal supports rotated-token reconnects; close-handler cleanup, not TTL sweeping, removes dead holders.
- Verify `hqTokenKey` in `packages/core/src/hq/auth-store.ts` produces hash-only material before alleging raw-token leakage or weakening `hq.auth_revoked` broadcasts.
- For provider endpoint credential suppression, check the entire chain: `envVars: []` writes in `packages/core/src/tools/fallback-provider-manage-tool.ts`, resolver handling in `packages/providers/src/index.ts`, SDK rejection in `packages/providers/src/catalog-provider-routing.ts`, and primary-key inheritance in `packages/cli/src/wiring/provider-runtime.ts` and `packages/webui-server/src/server/backend-services.ts`.
- Compare inline endpoint suppression predicates in both host wiring files against `endpointCredentialsSuppressed` in `packages/providers/src/endpoint-credentials.ts`; duplicated enforcement can drift.

## Capability Enforcement

- Trace `ToolCapabilities` through tool declarations, `WIDE_SUBAGENT_CAPABILITIES` and `DANGEROUS_FOR_SUBAGENTS` in `packages/core/src/security/capabilities.ts`, and `AutoApprovePermissionPolicy.evaluate` in `packages/core/src/security/auto-approve-policy.ts`. `.some()` permits any intersecting capability, so adding capabilities can weaken restrictions.

## Output, Prompt, and Network Boundaries

- Audit TUI render sinks for `sanitizeTerminalText` from `packages/tui/src/terminal-width.ts`, especially flat fallbacks and slash-command strings; sanitizer existence does not establish coverage.
- Audit prompt-firewall detection/redaction scope: `collectText()` in `packages/plugins/src/prompt-firewall/secret-detection.ts` scans system/messages, while `packages/plugins/src/prompt-firewall/index.ts` redacts only after detection. Include non-message string fields such as `tools[].description`.
- Distinguish hostname-based `validateTransportUrl` in `packages/mcp/src/transport-security.ts` from resolution-bound `assertNotPrivate` in the fetch path. Reuse resolution-bound checks at MCP connection time rather than adding another SSRF tier.

## Persistence and Test Safety

- Require effective, non-no-op encryption before `packages/core/src/plugins/sync-plugin.ts` writes `sync.json`; pass the host vault through top-level plugin API configuration in `packages/cli/src/wiring/plugins.ts`.
- In `packages/sage/src/sqlite-store.ts`, permanent-memory deletion checks must cover persisted state and `input.persistence`; audit every forced deletion with its force decision and persistence class.
- Create short-lived credential fixtures after slow server setup. If a security test fails only in the full suite, perform a scoped rerun and investigate setup-latency races before reporting a product regression.