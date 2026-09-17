# Verified Security Findings — WrongStack (2026-09-15)

## Summary
- Total raw candidates from Phase 2: **6** (hunt-core-hq-mcp-delta: 4, hunt-tools-delta: 2, hunt-webui-server-delta: 0) plus 28 hypotheses rejected by hunters
- After duplicate merging: **5** (HCM-004 + TD-002 → one root cause)
- Rejected in verification: **1** (TD-001)
- Final: **2 confirmed** (1 Medium, 1 Low) · **2 needs_validation** · 0 blocked

Independence: HCM-001…004 were verified by a separate agent that did not hunt them. TD-001/002 were verified by the orchestrator, which did not hunt them. No target code was executed.

## Confidence Distribution (dispositioned records)
- Very High (90-100): 0
- High Probability (70-89): 2 (WS-2026-09-15-01 = 80, WS-2026-09-15-02 = 85)
- Probable (50-69): 2 (NV1 = 60–80 across its two sink families, NV2 = 60)
- Possible (30-49): 0
- Low Confidence (0-29): 1 (TD-001 rejected, 15)

## Verified Findings

### WS-2026-09-15-01: HQ `/ws/client` accepts unauthenticated publishers on a password-protected network bind once no live client token remains
- **Severity:** Medium
- **Confidence:** 80/100 (High Probability)
- **Original skill:** hunt-core-hq-mcp-delta (carried lead from run-1, source unchanged)
- **Vulnerability type:** CWE-306 Missing Authentication for Critical Function
- **File:** `packages/cli/src/hq-server/auth.ts:369-371`
- **Reachability:** Direct: network WebSocket upgrade
- **Sanitization / framework protection:** None. The Origin gate accepts origin-less clients on a credentialed surface (`auth.ts:181-199`), and the Host header is attacker-supplied.
- **Description:** `hqClientAuthRequired` returns `requireAuthFloor || clientTokens.size > 0`. The floor latches only when exposure is `refuse`, which means no password and no browser tokens (`hq-server.ts:149-157`, `exposure.ts:94-118`). Expired client tokens are dropped by `projectAuthFile` (`auth-state.ts:54-56,81`). A password-protected HQ whose client tokens have expired or been revoked therefore skips `/ws/client` auth. `ws.ts:225-229` then accepts every self-declared capability from the tokenless socket.
- **Verification notes:**
  - Disproof attempts that failed: exposure re-assessment runs on every apply but ignores client tokens; no sweep closes tokenless clients; the watcher's close loop uses the same flawed predicate; `ipAllowlist` is off by default.
  - Not an accepted risk: SECURITY.md defines OPEN MODE as empty tokens **and no password**, and `docs/subcommands/hq.md:891` says `/ws/client` enforces client-token auth.
  - Impact is bounded: `run-command` still needs `control.execute` on the target's own token (`command-handlers.ts:167`).
- **Remediation:** make the predicate fail closed whenever any browser credential exists. Add a password + expired-client-token regression test, and validate it by re-introducing the bug.

### WS-2026-09-15-02: In-process HQ auth changes leave open `/ws/browser` sockets streaming
- **Severity:** Low
- **Confidence:** 85/100 (High Probability)
- **Original skill:** hunt-core-hq-mcp-delta (carried lead from run-1)
- **Vulnerability type:** CWE-613 Insufficient Session Expiration
- **Files:**
  - `packages/cli/src/hq-server/routes/auth/password-routes.ts:373-374,408-409`
  - `totp-routes.ts:341-343`
  - `session-audit-routes.ts:55,62`
  - `packages/cli/src/hq-server.ts:469,527-561`
- **Reachability:** Direct: routes authenticated for the operator; the affected party is any holder of an already-open browser socket.
- **Description:** In-process routes call `applyAuthFile` (bound to `authState.apply`), which updates `mutableAuth` before the file watcher runs. The watcher's before/after diff is then empty and its close loop is skipped. Sessions are cleared, so HTTP control is cut, but open sockets keep receiving telemetry, transcripts and approvals. Commit `3c25f47cf` added only a *token*-revocation announcement, and that announcement doesn't close anything.
- **Verification notes:** failed disproof attempts: there is no `sessions` observer, no per-frame cookie re-check (`ws.ts:92`), no heartbeat session check (`hq-server.ts:483-492`), and the session sweep doesn't touch sockets.
- **Remediation:** one `revokeSessions` helper that deletes sessions and closes their bound sockets, called from both the watcher and the routes.

## Needs Validation (no severity)

### WS-2026-09-15-NV1 (priority 1): Windows bare-executable resolution uses the untrusted project directory
- **Sources:** HCM-004 (MCP stdio: `cmd.exe /d /c call "<bare>"`, cwd = project) and TD-002 (git/rg/patch/docker via libuv spawn with project cwd; auto-approved `grep`/`diff`; codebase-index `git` at boot). The critic pass added a third site: security-scanner `pnpm/npm audit`.
- **Why it matters:** a cloned repository could ship `npx.cmd`/`git.exe`/`rg.exe` at its root and get code execution without any approval prompt. This is the same class as WS-SEC-01, which the repo fixed for LSP only.
- **New evidence from the verifier:** `buildChildEnv` (`packages/core/src/utils/child-env.ts:236-286`) strips `NoDefaultCurrentDirectoryInExePath`, so the OS-level mitigation can't be applied by the user either.
- **Exact blocker:** the Windows search order itself was not observed. The verifier proposed **Confirmed/High** based on documented cmd.exe semantics; the evidence gate keeps it unscored until the owner check runs.
- **Owner check:** the two harmless planted-binary checks in `findings.json` (scratch directory only).

### WS-2026-09-15-NV2: HQ `client.hello` clientId not bound to token
- **Blocker:** a deployment/intent fact: are client tokens issued to mutually less-trusted principals? Also, no channel was found that exposes a live victim's `clientId` to `/ws/client` peers.
- **Related:** under WS-2026-09-15-01, a tokenless peer can perform the same supersede.

## Eliminated Findings
- **TD-001:** `diff` tool reading outside the project via implicit `--no-index`. Rejected: exit 1 on differing files makes the tool throw with only stderr, and non-sensitive outside reads are already granted to the `read` tool. Kept as a hardening note.
- 7 orchestrator hypotheses (approval TTL, alerts SSRF, cmd-shim injection, repo-defined MCP, auto-wake approval, desktop IPC, COMSPEC hijack): rejected with controls cited in `findings/hunt-core-hq-mcp-delta.json`.
- 8 webui-server and 13 tools hypotheses were rejected by their hunters (see their JSON files).
