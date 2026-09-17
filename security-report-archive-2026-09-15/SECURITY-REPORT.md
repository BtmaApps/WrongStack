# Security Assessment Report

**Project:** WrongStack monorepo (local-first AI coding agent: CLI/TUI, WebUI, Electron desktop, HQ command center, MCP/ACP)
**Date:** 2026-09-15
**Source:** `ed3689988` (main) plus uncommitted sage working-tree changes
**Scanner:** security-check (standard profile · whole repository · source-only)
**Risk score:** **0.4 / 10 (Minimal, confirmed findings only).** This is not a clean bill: the top needs-validation lead would be High if it's confirmed.

> **Read this first.**
> - The run was **source-only**: no target code, tests or planted binaries were executed.
> - It was **delta-led**: surfaces byte-unchanged since the verified 2026-09-10 audit (`3984ebef1`) inherit that result; everything changed since then (94 commits) was hunted fresh.
> - The most important item is **NV1** (Windows planted-binary execution). It is unscored only because the Windows search order was not observed. Run its 2-minute owner check before treating this report as low risk.

## Executive Summary

Three hunters (HQ/core/MCP by the orchestrator, webui-server and tools by separate agents) reviewed the security-relevant delta. An independent verifier and a coverage critic followed.

- **Confirmed:** 2 (Critical 0 · High 0 · Medium 1 · Low 1).
- **Needs validation:** 2, both listed below without severity.
- **Rejected:** 1 candidate plus 35 hunter/orchestrator hypotheses, each with its disproving control cited.

### Key Metrics
| Metric | Value |
|---|---|
| Confirmed findings | 2 |
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |
| Needs validation | 2 |
| Coverage units | 35 covered · 13 carried · 6 candidate · 6 deferred · 8 n/a · 3 out of scope |

### Top Risks
1. **NV1 (unscored, priority 1):** on Windows, bare executable names (`npx`, `git`, `rg`, `pnpm`…) are resolved with the opened repository as the search directory. A hostile repo can plant the binary that runs, with no approval prompt, including at boot through codebase indexing. The same class as WS-SEC-01, fixed only for LSP.
2. **WS-2026-09-15-01 (Medium):** password-protected HQ on a network bind stops authenticating `/ws/client` once client tokens expire or are revoked.
3. **WS-2026-09-15-02 (Low):** changing the HQ password, enabling TOTP, or revoking a session doesn't close already-open browser sockets.

## Scan Statistics

| Statistic | Value |
|---|---|
| Files in scope (non-test source) | 4,043 |
| Lines of code (non-test) | ~981,000 |
| Test files (excluded) | 3,393 |
| Languages | TypeScript/JavaScript (≈100%), shell |
| Frameworks / runtimes | Node ≥22.19, pnpm workspace, React, Ink, Electron, `node:sqlite` |
| Changed since baseline | 94 commits; ~400 non-test files in security-relevant packages |
| Hunters / verifiers | 3 hunters · 2 verification passes · 1 coverage critic |
| Candidates before verification | 6 |
| Merged / rejected | 1 merged · 1 rejected |
| Final | 2 confirmed · 2 needs_validation |
| Dependencies (lockfile entries) | 1,570 |

### Finding Distribution (confirmed)
| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Authentication (HQ) | | | 1 | |
| Session management (HQ) | | | | 1 |
| Command execution / supply chain | | | | |
| Injection, XSS, SSRF, path traversal | | | | |

## Critical Findings
None confirmed.

## High Findings
None confirmed. NV1 is a potential High held at needs_validation; see below.

## Medium Findings

### WS-2026-09-15-01: HQ `/ws/client` accepts unauthenticated publishers on a password-protected network bind

**Severity:** Medium · **Confidence:** 80/100 · **CWE:** CWE-306 · **OWASP:** A07:2021 Identification and Authentication Failures
**Location:** `packages/cli/src/hq-server/auth.ts:369-371`

**Description:**
`/ws/client` authentication runs only when `requireAuthFloor || clientTokens.size > 0`. The floor latches only in true open mode (no password, no browser tokens). Expired client tokens are dropped from the projected set. On a password-protected HQ whose client tokens have all expired or been revoked, a network peer can open `/ws/client` with no token and no Origin. It then sends `client.hello`, and the server accepts every capability it declares (`ws.ts:225-229`). The code contradicts both its own doc comment (`auth.ts:363-368`) and SECURITY.md's definition of OPEN MODE.

**Vulnerable code:**
```ts
export function hqClientAuthRequired(mutableAuth: HqRouterMutableAuth): boolean {
  return mutableAuth.requireAuthFloor === true || mutableAuth.clientTokens.size > 0;
}
```

**Proof of concept (conceptual):**
1. The operator runs HQ on `0.0.0.0` with a password.
2. The first-run client token expires, or the operator revokes the last one.
3. A peer upgrades `/ws/client` without credentials.
4. That peer registers a session carrying `control.approve`.
5. It appears on the dashboard, can present spoofed approval prompts, and receives approve, answer-input and steer commands the operator sends to it.

**Impact:** spoofed fleet telemetry and approval prompts, plus interception of operator decisions targeted at the rogue client. Remote execution is blocked because `run-command` still requires `control.execute` on the target's own token.

**Remediation:**
```ts
export function hqClientAuthRequired(a: HqRouterMutableAuth): boolean {
  const hasBrowserCredential =
    a.passwordHash !== undefined || a.browserTokens.size > 0 || a.requireBrowserAuth === true;
  return a.requireAuthFloor === true || a.clientTokens.size > 0 || hasBrowserCredential;
}
```
Add a test with `passwordHash` plus one expired client token that asserts the tokenless upgrade gets 401. Per SECURITY.md rule 3, confirm the test fails against the current predicate. Also warn in `wstack hq token revoke --client` when it removes the last client token.

**References:** https://cwe.mitre.org/data/definitions/306.html · https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/

## Low Findings

### WS-2026-09-15-02: In-process HQ auth changes leave open browser sockets streaming

**Severity:** Low · **Confidence:** 85/100 · **CWE:** CWE-613 · **OWASP:** A07:2021
**Location:** `packages/cli/src/hq-server/routes/auth/password-routes.ts:373-374,408-409`; `totp-routes.ts:341-343`; `session-audit-routes.ts:55,62`; `packages/cli/src/hq-server.ts:469,527-561`

**Description:** routes apply the new auth file to live state before the `auth.json` watcher runs. The watcher's before/after comparison then sees no change and skips the close loop that evicts `/ws/browser` sockets. HTTP sessions are cleared, but a revoked party's open socket keeps streaming telemetry, transcripts and approval payloads.

**Impact:** confidentiality only, for a party the operator is actively revoking (e.g. a password rotated after a suspected compromise).

**Remediation:** a single `revokeSessions(ids | 'all')` helper that deletes session entries and closes matching `browserSocketSessions` sockets. Call it from both the watcher and every in-process auth route.

## Hardening and Positive Controls

**Hardening (unscored):**
- **`diff` tool (TD-001, rejected):**
  - Put `--end-of-options` before refs.
  - Bound `findGitDir` at `projectRoot`.
  - Add `a`/`b` to the `inputPathLooksSensitive` keys.
  - Today the tool is safe only because `git diff --no-index` exits 1 and the tool throws on non-zero exit. A future "treat differences as success" change would reopen an unapproved out-of-root read.
- **`buildChildEnv`:** set `NoDefaultCurrentDirectoryInExePath=1` on win32. It currently strips the variable, a defense-in-depth step for NV1.
- **HQ:** also record session binding for bare `?token=` browser sockets, so precise eviction never relies on its fail-closed fallback.

**Positive controls verified in this run:**
- **Permission grants:** an `always` approval now expires after 24h, and an expired grant re-prompts rather than granting (`permission-policy.ts`).
- **Prompt fences:** the project-supplied fence now neutralizes CR/LF-split closing tags, and `knowledge.json` is fenced. SAGE memory evidence is fenced per entry and capped.
- **Repo config denylist:** it grew to cover `tools.loopDetection`, `maxIterations`, `autoExtendLimit`, `maxAutoExtensions` and `disabledModels`. Repo-defined `mcpServers` remain stripped.
- **LSP binaries:** the WS-SEC-01 location gate in `plug-lsp` still holds.
- **HQ:**
  - approve/answer-input now require `control.approve` on the browser credential
  - TOTP verification rejects malformed inputs
  - the container is published on loopback by default and the image is digest-pinned
- **Supply chain:**
  - install cooldown of 1440 minutes, with both exclude entries still present in the lockfile
  - 3-package build allowlist
  - no git/tarball dependencies
  - a PR cannot waive its own audit gate
- **webui-server delta:** the model-test route takes safe ids only, static-file containment holds, CSP additions come only from operator keys, and new WS preference keys can't reach autonomy or YOLO.
- **Carried from 2026-09-10 (source unchanged):** fetch SSRF guard, child-env sanitization, secret vault/scrubber, yolo-risk, WebUI WS auth, mailbox bridge, sage-mcp policy, plugin mutation, timing-safe compare, release/pages workflows.

## Remediation Roadmap

### Phase 1: Immediate (1-3 days)
| # | Item | Effort | Impact |
|---|---|---|---|
| 1 | Run the NV1 owner check on Windows. If the planted binary runs, treat it as High: add a shared absolute resolver that excludes the cwd and anything inside the project, and use it at every MCP/tools spawn site | Medium | potential High (RCE on repo open) |
| 2 | WS-2026-09-15-01: make `hqClientAuthRequired` fail closed when a browser credential exists, and add an injection-validated test | Low | Medium |

### Phase 2: Short-Term (1-2 weeks)
| # | Item | Effort | Impact |
|---|---|---|---|
| 3 | WS-2026-09-15-02: unify session revocation with socket eviction | Low | Low |
| 4 | NV2: owner decision on per-machine client tokens; if yes, bind `clientId` to the first token that registered it | Low | depends |
| 5 | `buildChildEnv`: set `NoDefaultCurrentDirectoryInExePath=1` on win32 | Low | defense in depth |

### Phase 3: Medium-Term (1-2 months)
| # | Item | Effort | Impact |
|---|---|---|---|
| 6 | Cover deferred units: ACP turn/permission lifecycle, `run-delegation.ts` capability inheritance, MCP SSE transport bounds, HQ answer-input shape, new webui/tui/simpleui components | Medium | coverage |
| 7 | Confirm `pnpm audit` is green on `ed3689988` (DEP-NV-001) | Low | supply chain |

### Phase 4: Hardening (Ongoing)
| # | Recommendation | Effort | Impact |
|---|---|---|---|
| 8 | `diff` tool: end-of-options, bounded `findGitDir`, `a`/`b` sensitive keys | Low | defense in depth |
| 9 | Architecture test enumerating spawn sites that must use the absolute resolver, validated by injection (SECURITY.md rule 3) | Medium | regression guard |

## Needs Validation, Hardening, and Coverage

### NEEDS VALIDATION

**NV1 (priority 1): Windows bare-executable resolution uses the untrusted project directory** (CWE-427)
- **Trace:** MCP registry cwd = project root (`lifecycle-plugins.ts:413-417`, `pre-context-services.ts:287-294`, `acp-mcp-servers.ts:58-63`). From there:
  - `client.ts:287-298`: `COMSPEC /d /c call "<bare>"`
  - `child-env.ts:236-286`: the mitigation variable is stripped
  - `tools/src/{grep,diff,git,replace,patch,logs}.ts`: bare `spawn`
  - `codebase-index/indexer.ts`: bare `execFile('git')` at boot
  - `security-scanner/src/package-audit.ts`
- **Blocker:** Windows search order was not observed (source-only). The independent verifier proposed Confirmed/High on documented cmd.exe semantics.
- **Owner check (scratch dir, harmless files):**
  - `spawnSync(process.env.COMSPEC, ['/d','/c','call "npx" --version'], {cwd: dirWithEchoNpxCmd, windowsVerbatimArguments: true})`
  - `spawnSync('rg', ['--version'], {cwd: dirWithRenamedWhoamiAsRgExe})`

  Output from the planted file means confirmed.

**NV2: HQ `client.hello` clientId not bound to token** (CWE-639)
- **Trace:** `ws.ts:248-271` supersede never compares `authToken`; `command-handlers.ts:62` targets by clientId; `HqToken` has no identity binding.
- **Blocker:** whether client tokens go to mutually less-trusted principals, and whether a live clientId is discoverable.
- **Owner check:** two-token vitest; a second hello with the same clientId must be refused.

**DEP-NV-001:** the advisory status of the updated lockfile wasn't queried, because that is an external registry call.

### Coverage
- **Totals:** 35 covered (fresh) · 13 covered (carried) · 6 candidate · 6 deferred · 8 not applicable · 3 out of scope · 0 blocked. Details in `coverage-ledger.md`.
- **Coverage critic:** it re-walked 27 entry surfaces missing from the first ledger. That added 1 site to NV1 (security-scanner), confirmed the in-project denylist only grew, and found only robustness changes in the changed daemons, telegram (HTML now escaped) and the MCP adapters.
- **Deferred (explicit):**
  - ACP `server-agent-turn`/`acp-session` rewrite
  - `run-delegation.ts` capability inheritance
  - MCP SSE transport
  - HQ answer-input validation
  - client UI component delta
  - `pnpm audit`

## Methodology

This assessment used security-check, an AI-assisted static analysis pipeline.

### Pipeline Phases
1. **Reconnaissance:** architecture map, a delta against the last verified audit, and a byte-level unchanged check for carried surfaces.
2. **Vulnerability hunting:** 3 hunters on the changed security-relevant code (HQ/core/MCP/plug-lsp/desktop/deploy/CI, webui-server, tools), applying the TypeScript, injection, access-control, SSRF, path, AI/agent, protocol and local-IPC checklists.
3. **Verification:** adversarial disproof by a party that didn't hunt each candidate; duplicates merged by root cause; confidence scoring; verdict gate.
4. **Reporting:** severity only for confirmed records.

### Limitations
- Static analysis only. No runtime, dynamic or platform-behavior testing (this is what holds NV1 and NV2 open).
- Delta-led: unchanged surfaces rely on the 2026-09-10 audit's verification.
- The deferred units listed above were not fully reviewed.
- AI reasoning can miss issues that need deep domain knowledge. Confidence scores are estimates.

## Disclaimer

This security assessment was performed using automated AI-powered static analysis. It does not constitute a comprehensive penetration test or security audit. The findings represent potential vulnerabilities identified through code pattern analysis and LLM reasoning. False positives and false negatives are possible.

This report should be used as a starting point for security remediation, not as a definitive statement of the application's security posture. A professional security audit by qualified security engineers is recommended for production applications handling sensitive data.

Generated by security-check — github.com/ersinkoc/security-check
