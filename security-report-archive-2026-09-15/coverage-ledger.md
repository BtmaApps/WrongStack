# Coverage Ledger — WrongStack (2026-09-15)

Profile standard · scope whole repository · source-only · HEAD `ed3689988` + working tree · delta baseline `3984ebef1`.

Status legend: `covered` (fresh evidence this run) · `covered (carried)` (source byte-unchanged since the verified 2026-09-10 audit; unchanged-check is the evidence) · `candidate` · `in_progress` · `deferred` · `not_applicable` · `out_of_scope`.

## Delta units (changed since baseline — hunted fresh)

| Coverage ID | Surface | Boundary | Subsystem | Attack class | Starting paths | Status | Evidence | Gap |
|---|---|---|---|---|---|---|---|---|
| HQ-CLIENT-AUTH-FLOOR | `/ws/client` upgrade | network peer → publisher channel | cli/hq-server | authentication | `hq-server/auth.ts`, `upgrade-handler.ts` | candidate | HCM-001 (carried run-1 lead re-read at HEAD, unchanged) | runtime repro |
| HQ-CLIENT-HELLO-IDENTITY | `client.hello` | token holder → other publisher | cli/hq-server | identity binding | `hq-server/ws.ts` | candidate | HCM-002 | runtime repro + deployment fact |
| HQ-BROWSER-REVOCATION | open `/ws/browser` | revoked session → telemetry | cli/hq-server | session expiry | `hq-server.ts`, `routes/auth/*` | candidate | HCM-003 | runtime repro |
| HQ-COMMAND-APPROVE-AUTHZ | `POST /api/command` approve/answer-input | browser capability → approval | cli/hq-server | authorization | `routes/command-handlers.ts` | covered | new 403/409 capability gates read | |
| HQ-NEW-READ-ROUTES | `/api/health/mailbox`, events filters | browser → data | cli/hq-server | authz / injection | `routes.ts`, `routes/{system,data}-handlers.ts` | covered | inside authenticated router; filters narrow only | |
| HQ-ALERTS-OUTBOUND | alerts config | config → network | core/hq | SSRF | `core/src/hq/alerts*.ts` | covered | no outbound sink | |
| CORE-TRUST-TTL | `always` approval persistence | LLM tool call → standing grant | core/security | privilege persistence | `permission-policy*.ts` | covered | expiry re-prompts, never grants | |
| CORE-TOTP-VERIFY | TOTP / recovery verify | network → 2FA | core/security | auth | `security/totp.ts` | covered | diff only narrows acceptance | |
| MCP-STDIO-SPAWN-WIN-CWD | stdio MCP spawn (Windows) | cloned repo → executed binary | mcp | CWE-427 search path | `mcp/src/client.ts`, `core/src/utils/win32-cmd.ts` | candidate | HCM-004 | OS search-order runtime check |
| MCP-INPROJECT-CONFIG | repo `.wrongstack` config | repo → MCP definition | core/config | RCE | `in-project-policy.ts` | covered | `mcpServers` stripped (:70) | |
| MCP-CMD-SHIM-INJECTION | MCP command/args on win32 | config/WebUI → cmd.exe | core/utils | command injection | `win32-cmd.ts` | covered | metachar refusal + quoting | |
| MCP-OAUTH-REFRESH | MCP OAuth refresh | AS response → token store | mcp | auth / token handling | `token-store.ts`, `authorization.ts` | covered | HTTPS-only, no redirects, 4xx marks rejected | |
| LSP-PROJECT-LOCAL-BINARY | LSP auto-discovery | cloned repo → executed binary | plug-lsp | RCE (WS-SEC-01 revalidation) | `utils/command-resolver.ts` | covered | default-false + isInsideProject gate intact | |
| AI-PROJECT-FENCE | repo instructions/identity/knowledge | repo → system prompt | core/utils, coordination/agents | prompt injection | `project-supplied-fence.ts`, `project-agent-identity.ts` | covered | CR/LF closer fixed; knowledge.json fenced | |
| AI-MEMORY-EVIDENCE-FENCE | SAGE retrieval → provider prompt | stored memory → prompt | core/core | prompt injection | `agent-response.ts`, `memory-evidence-fence.ts` | covered | per-entry fence + 12k cap | |
| AI-DELEGATE-AUTOWAKE | background delegation results | subagent output → leader turn | core/coordination/delegation | approval bypass | `leader-auto-wake.ts`, `run-delegation.ts` | covered | waits on confirm; same permission mode | |
| DESKTOP-IPC-OPEN-SESSIONS | Electron IPC | remote WebUI renderer → shell | apps/desktop | IPC injection | `ipc-handlers/index.ts`, `webui/open-sessions.ts` | covered | sender-bound + sanitized | |
| INFRA-HQ-DEPLOY | HQ container | host network → HQ | deploy/hq | exposure | `Dockerfile`, `compose.yaml` | covered | loopback publish, digest pin | |
| CICD-WORKFLOWS | GitHub Actions | PR author → CI | .github | CI/CD injection | `ci.yml`, `audit.yml` | covered | env-passed SHA, no secrets in new steps | |
| SAGE-WORKTREE-DIFF | SAGE hygiene/search (uncommitted) | stored memory → retrieval | sage | logic | `sqlite-store-{hygiene,search}.ts` | covered | fail-closed path filter; critical-delete gate | |
| CORE-WORKTREE-GIT | worktree git ops | LLM/goal → git argv | core/worktree | argument injection | `worktree-git.ts`, `worktree-manager.ts` | covered | no shell, user-config identity | Windows search-order folded into HCM-004 / TOOLS-WIN-CWD-EXE-SEARCH |
| WEBUI-MODELTEST-SSRF | provider model test | WS client → outbound + keys | webui-server | SSRF / credential exfil | `provider/model-test.ts`, `provider-routes.ts` | covered | hunter: id-only inputs, operator config source | |
| WEBUI-PTY-SPAWN | terminal helper | WS client → spawn | webui-server | CMDi | `node-pty-spawn-helper.ts`, `terminal-ws-handler.ts` | covered | hunter: fixed resolve path; chmod only printed | |
| WEBUI-HTTP-AUTH-NEWROUTES | new HTTP routes | browser → API | webui-server | auth bypass | `http-server.ts`, `integration-status.ts` | covered | hunter: behind token + Origin | |
| WEBUI-STATIC-PATH | static serving | browser → fs | webui-server | path traversal | `static-file-handler.ts`, `frontend-static-serve.ts` | covered | hunter: dist containment holds | |
| WEBUI-CSP-CONNECTSRC | CSP header | config → CSP | webui-server | CSP bypass | `integration-connect-src.ts` | covered | hunter: operator-only keys, origin-reduced | |
| WEBUI-WS-MASSASSIGN | prefs over WS | WS client → config | webui-server | mass assignment | `ws-payload-preferences.ts`, `prefs-handlers.ts` | covered | hunter: new keys cannot reach autonomy/YOLO | |
| WEBUI-SESSION-IDOR | session-keyed ops | tab/client → other session | webui-server | IDOR | `session-handlers.ts`, `embedded-*` | covered | hunter: exact request+session id match | |
| TOOLS-EXEC-CMDI | exec/pwsh/install/test/lint | LLM → spawn | tools | CMDi | `exec.ts`, `pwsh.ts`, … | covered | tools hunter: allowlist/flag guards and child env hold (see hunt-tools-delta.json) | |
| TOOLS-GIT-ARGINJ | git tool | LLM → git argv | tools | argument injection | `git.ts` | covered | tools hunter: no raw args, leading-dash refusal | |
| TOOLS-SPAWN-TOOLCHAIN | typecheck/lint/format/outdated | LLM/repo → spawn | tools | CMDi / repo exec | `typecheck.ts`, `lint.ts`, … | covered | tools hunter | |
| TOOLS-CODEBASE-TOOLCHAIN-SCRIPTS | codebase index toolchains | repo → spawn | tools/codebase-index | repo-controlled exec | `toolchain-scripts.ts`, `worker.ts` | covered | tools hunter | bare-name git at boot folded into NV1 |
| TOOLS-PATH-CONTAINMENT | fs tools | LLM → fs | tools | path traversal | `glob/grep/replace/patch/tree/diff/logs/json/design.ts` | covered | TD-001 rejected (diff.ts:244-247 discards stdout on no-index exit 1); hardening note | `json.ts`, `kanban-lifecycle-actions.ts` not re-read in depth |
| TOOLS-AUTONOMY-ESCALATION | mode/plan/task/kanban tools | LLM → permission mode | tools | privilege escalation | `mode.ts`, `tool-use.ts`, … | covered | tools hunter | |
| TOOLS-WIN-CWD-EXE-SEARCH | bare-name spawns (Windows) | repo → executed binary | tools | CWE-427 | grep/diff/git/replace/patch/logs/indexer | candidate | TD-002 → merged into WS-2026-09-15-NV1 | Windows runtime search order |
| CRITIC-INPROJECT-DENYLIST | repo `.wrongstack` config | repo → operator budget/controls | core/config | control tampering | `in-project-policy.ts` | covered | +40 lines, additions only (loopDetection, maxIterations, autoExtend*, disabledModels) | |
| CRITIC-DAEMON-SERVERS | project IPC daemons | local client → daemon | sage, tools/codebase-index, core/session-catalog | IPC input handling | `*/project-server.ts` | covered | diffs: stop-abort, 9p refusal, type normalization; no auth change; others unchanged | |
| CRITIC-TELEGRAM | Telegram outbox | agent text → Bot API | telegram | HTML injection | `outbox.ts`, `offset-store.ts` | covered | HTML now escaped + wire-limit safe cut; atomic tmp cleanup | |
| CRITIC-MCP-ADAPTERS | codebase-index-mcp, kanban-mcp, runtime | MCP client → tools | mcp servers | authz / arg parsing | `adapter.ts`, `cli.ts`, `tool-registration.ts` | covered | error-shape and flag-parsing only; `--port` range-validated | |
| CRITIC-SECSCANNER-AUDIT | security-scanner package audit | repo → spawned package manager | security-scanner | CWE-427 | `package-audit.ts` | candidate | cmd shim with cwd=projectRoot → site added to NV1 | Windows runtime search order |
| CRITIC-UNCHANGED-ENDPOINTS | prometheus, OAuth loopback, network-guard proxy, persistence endpoint, governance/kanban/chronicle/mailbox daemons, launch-menu, HQ short-circuit, desktop runtime-manager, webui companion, path-guard plugin, mailbox/requirement-intake MCP | various | various | various | listed | covered (carried) | `git diff --numstat 3984ebef1 HEAD` empty for each | |
| DEP-ADVISORIES | lockfile | registry → install | supply chain | known CVEs | `pnpm-lock.yaml` | deferred | DEP-NV-001 | registry call excluded by source-only |
| DEP-SUPPLY-CONTROLS | install/build policy | registry → build | supply chain | lifecycle scripts / cooldown | `pnpm-workspace.yaml`, `audit.yml` | covered | cooldown, allowlist, live excludes, no exotic sources | |

## Carried units (source unchanged since verified 2026-09-10 audit)

| Coverage ID | Subsystem | Attack class | Paths (unchanged-check: `git diff --numstat 3984ebef1 HEAD` empty) | Status |
|---|---|---|---|---|
| CARRY-FETCH-SSRF | tools | SSRF | `tools/src/fetch.ts`, `read-url-content.ts` | covered (carried) |
| CARRY-CHILD-ENV | tools | secret leak to child | `tools/src/_env.ts` | covered (carried) |
| CARRY-SECRETS-AT-REST | core/security | crypto / secrets | `secret-vault.ts`, `secret-scrubber.ts`, `config-secrets.ts` | covered (carried) |
| CARRY-YOLO-RISK | core/security | CMDi classification | `yolo-risk.ts` | covered (carried) |
| CARRY-WEBUI-WS-AUTH | webui-server | WS auth / CSWSH | `ws-auth.ts` | covered (carried) |
| CARRY-MAILBOX-BRIDGE | cli | auth | `subcommands/handlers/mailbox-serve.ts` | covered (carried) |
| CARRY-SAGE-MCP-POLICY | sage-mcp | authz | `sage-mcp/src/policy.ts` | covered (carried) |
| CARRY-PLUGIN-MUTATION | core/plugin | authz | `plugin/api.ts` | covered (carried) |
| CARRY-TIMING-SAFE | primitives | crypto timing | `primitives/src/timing-safe.ts` | covered (carried) |
| CARRY-REDACTION | core/utils | data exposure | `utils/redaction.ts` | covered (carried) |
| CARRY-RELEASE-PAGES | .github | CI/CD | `release.yml`, `pages.yml` | covered (carried) |
| CARRY-SQLI | sage, kanban, codebase-index, catalog | SQLi | ~137 parameterized sites; FTS MATCH bound (2026-09-10) — delta SQL touched only `sqlite-store-search.ts` (constant `'0'` clause, parameters unchanged) | covered (carried + delta check) |

## Not applicable / out of scope

| Coverage ID | Reason |
|---|---|
| NA-GRAPHQL, NA-NOSQL, NA-LDAP, NA-XXE, NA-SSTI, NA-JWT, NA-IAC | technology absent (recon §1) |
| NA-FILE-UPLOAD | no multipart upload handler; image attachments are base64 WS payloads parsed by `parseIncomingImages` (unchanged posture) |
| OOS-WEBSITE | `website/` docs site, not shipped in CLI/desktop artifacts |
| OOS-TESTS-BENCH | `**/tests/**`, `packages/bench`, `e2e/` — non-production |
| OOS-ACCEPTED-RISKS | SECURITY.md accepted items (same-user token readability, release build-in-publish job, hooks as operator code, DNS-rebinding best effort, heuristic ReDoS) — not refiled |

## Deferred (explicit)

| Coverage ID | Reason |
|---|---|
| DEF-ACP-TURN | `packages/acp/src/agent/server-agent-turn.ts` (+210) / `client/acp-session.ts` (+254): permission-request code paths grep-checked for auto-allow fallbacks (none seen); full lifecycle review not done this run |
| DEF-DELEGATE-TOOL-REWRITE | `coordination/delegate-tool.ts` (−1093/+) → `delegation/run-delegation.ts` (+1129): capability-gating inheritance for background subagents not re-traced line by line (auto-wake approval path covered) |
| DEF-MCP-TRANSPORT-SSE | `transport-sse.ts` (+346 churn), `sse-reader.ts`: parser bounds not re-verified |
| DEF-HQ-ANSWER-INPUT | carried deferral from run-1: answer shape validation / `resolveUserInput` sweep |
| DEF-TUI-SIMPLEUI-WEBUI-CLIENT | client-rendering delta (webui 60, tui 47, simpleui 24 files): XSS posture carried (single constant `dangerouslySetInnerHTML`, no rehype-raw) but new components not individually read |

## Coverage-critic pass
Method: every entry surface in recon §3 (plus the MCP servers, telegram, techstack, security-scanner and runtime packages) was checked with `git diff --numstat 3984ebef1 HEAD` against the first ledger. Unlisted changed surfaces were read diff-first.

- **Added rows:** CRITIC-INPROJECT-DENYLIST, CRITIC-DAEMON-SERVERS, CRITIC-TELEGRAM, CRITIC-MCP-ADAPTERS, CRITIC-SECSCANNER-AUDIT (candidate, folded into NV1), CRITIC-UNCHANGED-ENDPOINTS (13 surfaces, carried).
- **Alternate routes checked:**
  - HCM-003: session delete and TOTP enable, not only password change.
  - NV1: cmd.exe shim (MCP, security-scanner) and libuv spawn (tools, indexer).
  - HCM-001: the watcher's close loop reuses the flawed predicate.
- **Result:** no new independent root cause. One extra NV1 sink site. Six units remain explicitly deferred (above).

**Final totals:** 35 covered · 13 covered (carried) · 6 candidate · 6 deferred · 8 not applicable · 3 out of scope · 0 blocked.
