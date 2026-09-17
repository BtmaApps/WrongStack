# Architecture Map — WrongStack (security-check, 2026-09-15)

- **Source ref:** `ed3689988` (main) + uncommitted working tree (`packages/sage/src/sqlite-store-{hygiene,search}.ts`)
- **Prior full-audit baseline:** `3984ebef1` (2026-09-10 23:57), remediated 2026-09-11. Prior scoped HQ run: `~/security-audit-skill/WrongStack/run-1` (2026-09-15, `a159bc78f`).
- **Profile / scope / validation:** standard · whole repository · source-only (no target code executed)
- **Method:** delta-led. Surfaces whose source is byte-unchanged since `3984ebef1` inherit that audit's verified result (listed in the ledger as `covered (carried)` with the unchanged check). Every surface changed since baseline (94 commits, ~400 non-test source files in security-relevant packages) was hunted fresh.

## 1. Technology stack
| Item | Fact |
|---|---|
| Languages | TypeScript (~99%: 3,330 `.ts` + 613 `.tsx` non-test), JS/MJS build scripts (94), shell (10) → **sc-lang-typescript** only |
| Size | 4,043 non-test source files, ~981k lines; 3,393 test files |
| Runtime | Node ≥22.19 (also Bun for some builds), pnpm 12.3.4 workspace, 34 packages + `apps/desktop` (Electron) + `apps/wrongstack` + `website` |
| UI | React (webui, webui-hq, simpleui), Ink (tui) |
| Storage | `node:sqlite` (SAGE, kanban, codebase-index, mailbox, catalog), JSONL session journals, JSON config under `~/.wrongstack` |
| Crypto | AES-256-GCM secret vault, scrypt (versioned KDF) for HQ passwords, HMAC-signed cookies, TOTP (RFC 6238) |
| No | SQL servers, NoSQL, GraphQL, LDAP, XML parsing, JWT libraries, template engines, Terraform/K8s |

## 2. Application type
Local-first **AI coding agent**: CLI/TUI (`packages/cli`, `packages/tui`), local WebUI/SimpleUI servers, Electron desktop shell, a network-capable **HQ command center** (`wstack --hq`), MCP client + MCP server, ACP agent, per-project IPC daemons, plus libraries published to npm.

## 3. Entry points
| Surface | Path | Default bind / auth |
|---|---|---|
| HQ HTTP + `/ws/browser` + `/ws/client` | `packages/cli/src/hq-server.ts`, `hq-server/{upgrade-handler,ws,auth,routes}.ts` | CLI `0.0.0.0:3499`; browser tokens / scrypt password / TOTP; client tokens |
| WebUI / SimpleUI HTTP + WS | `packages/webui-server/src/server/{http-server,ws-auth,routes}.ts`, `packages/cli/src/webui-server.ts` | loopback; token on every bind + Origin/Host-rebinding checks |
| Mailbox HTTP bridge | `packages/cli/src/subcommands/handlers/mailbox-serve.ts` | opt-in, bearer token |
| MCP server (`mcp serve [--http]`) | `packages/mcp/src/server.ts` | stdio or HTTP (ephemeral port) |
| ACP agent | `packages/acp/src/agent/*` | stdio from editor |
| Project daemons (IPC named pipe / unix socket) | `packages/{sage,kanban,governance,tools/codebase-index}/src/project-server.ts`, `packages/core/src/{chronicle,session-catalog,coordination}/…project-server.ts` | per-user pipe + token (`timingSafeTokenEqual`) |
| Electron IPC | `apps/desktop/src/main/{main,preload,webui-preload}.ts`, `ipc-handlers/index.ts` | contextIsolation + sandbox; sender-bound handlers |
| Prometheus exporter | `packages/core/src/observability/prometheus.ts` | opt-in |
| OAuth loopback callbacks | `packages/providers/src/oauth/shared.ts` | ephemeral loopback |
| Browser network guard proxy | `packages/tools/src/browser/network-guard-proxy.ts` | loopback |
| LLM tool calls (adversarial) | `packages/tools/src/*`, `packages/core/src/tools/*` | permission policy (`core/src/security/permission-policy.ts`) |
| Repo content (low trust) | instructions, `.wrongstack/` in-project config, agent identity files, LSP/toolchain discovery | in-project policy strip (`core/src/storage/config-loader/in-project-policy.ts`), project-supplied fences |

## 4. Data flow (security-relevant)
- **LLM output → tool input → sink** (spawn, fs write, fetch). Controls: permission policy + capability allowlists, YOLO per-kind gate, path containment, env sanitization (`tools/src/_env.ts`), exec allowlist, SSRF guard (`tools/src/fetch.ts`).
- **Repo content → system prompt.** Controls: `formatProjectSuppliedBlock` (`core/src/utils/project-supplied-fence.ts`), used by 6 call sites; SAGE memory evidence via `formatMemoryEvidenceBlock` (`core/src/utils/memory-evidence-fence.ts`).
- **Repo content → spawned binaries.** plug-lsp location gate (`plug-lsp/src/utils/command-resolver.ts`, WS-SEC-01 fix); in-project `mcpServers` stripped (`in-project-policy.ts:70`).
- **Remote HQ operator → local agent.** `POST /api/command` → client command queue → publisher approval bridge (`core/src/hq/approval-bridge.ts`) → `waitForConfirm`.
- **Local session → HQ.** Publisher with redaction policy (`core/src/hq/redaction.ts`) → HQ event store.

## 5. Trust boundaries
1. LLM / tool-input (none) → local user authority. 2. Cloned repo (low) → prompts, spawned binaries, config. 3. Network peer → HQ (browser vs client channels, capability-scoped tokens). 4. Browser origin → WebUI/HQ (Origin + Host checks, SameSite=Lax cookie). 5. Remote/collab viewer → local operator (`denyHighRiskRemoteClient`, `authorizeDesktopAction`). 6. MCP server response (low) → agent. 7. Same-user local process → loopback APIs (**accepted**: token file readable by same user, SECURITY.md).

## 6. External integrations
LLM providers (Anthropic, OpenAI/Codex OAuth, Copilot, AI Gateway, Bedrock, Vertex, custom OpenAI-compatible), MCP servers (stdio via `npx`/`uvx`/`wstack-*`, SSE, streamable HTTP with OAuth), Telegram, TryCloudflare tunnel (`--tunnel`), npm registry (release OIDC).

## 7. Authentication architecture
- **HQ:** browser tokens + client tokens (`core/src/hq/auth-store.ts`), scrypt password (`scrypt$N=` versioned, transparent rehash), signed HttpOnly SameSite=Lax cookies (7-day), TOTP single-use counter (`routes/auth/common.ts consumeTotpCode`), per-IP login backoff, live `auth.json` reload with WS-010 `requireAuthFloor`.
- **WebUI:** per-instance token in `~/.wrongstack/webui-instances.json` (0600), WS ticket (cookies not port-isolated).
- **Daemons:** random token + `timingSafeTokenEqual` (`packages/primitives/src/timing-safe.ts`).
- **MCP OAuth:** `packages/mcp/src/{authorization,token-store}.ts`, HTTPS-only, no redirects.

## 8. Security-sensitive files
`~/.wrongstack/{config.json (vault enc:v1), trust.json, hq/auth.json, webui-instances.json, projects/*}`; `deploy/hq/{Dockerfile,compose.yaml,.env.example}`; `.github/workflows/{ci,audit,release,pages}.yml`; `pnpm-workspace.yaml` (build allowlist, cooldown); `patches/ink@7.1.1.patch`.

## 9. Detected security controls (positive)
Env sanitization; exec allowlist; git tool without raw args; NFA `compileGlob`; SSRF numeric range blocking + per-hop redirect recheck; secret vault + scrubber; capability-based permission gating; YOLO per-kind destructive gate; in-project config strip with compile-time field registry coverage; project-supplied fences (now also covering CR/LF closers and `knowledge.json`, changed since baseline); `always`-approval TTL (24h, expiry re-prompts rather than grants — `permission-policy.ts`, new since baseline); HQ security headers, 1 MiB WS cap, TOTP single-use; Electron sandbox + contextIsolation; CI SHA-pinned actions, `persist-credentials:false`, OIDC publish with reviewed environment; `minimumReleaseAge: 1440`; `onlyBuiltDependencies` default-deny; PR-cannot-waive-own-audit gate; HQ image digest-pinned and loopback-published by default.

## 10. Detected languages → skills
- TypeScript/JavaScript (≈100%) → **sc-lang-typescript** (applied through the delta hunters' checklists)

## 11. Specialized surfaces
- **sc-ai-security:** yes — LLM tool calling, SAGE persistent memory + retrieval injection, MCP client/server, subagent delegation with background auto-wake (new), prompt fences.
- **sc-protocol-security:** yes — HQ WS protocol (client.hello, command_poll), mailbox bridge, JSON-RPC (MCP/ACP), SSE.
- **sc-local-ipc:** yes — Electron IPC/preload, per-project named-pipe daemons, node-pty terminal, OAuth loopback callbacks.
- Not applicable: GraphQL, NoSQL, LDAP, XXE, SSTI, JWT, file upload (images only via base64 WS attachments), IaC.

## 12. Coverage ledger
Authoritative: [`coverage-ledger.md`](coverage-ledger.md).
