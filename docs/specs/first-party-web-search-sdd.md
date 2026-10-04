# Spec: First-Party Web Search (plan 35)

**Status:** Proposed · **Source:** `docs/competitive-roadmap-2026-2027/35-first-party-web-search.md` · **Date:** 2026-10-04 · **Template:** feature

## Overview

Give the agent toolset a built-in `web_search` tool so coding agents can ground answers in live web evidence without users procuring API keys or configuring an MCP search server. Results are bounded and scrubbed; the tool is read-only; the network-touching call goes through the standard approval policy. Backends: `off` (v1 default — actionable error), `hosted` (zero-key service), `provider` (user key from env/SecretVault).

## Requirements

- [critical] **R1 — Tool contract:** builtin `web_search` in `packages/tools`: `mutating: false`, `permission: "confirm"` (network egress → prompts unless YOLO, exactly like other network tools), JSON-schema input `{ query: string, maxResults?: 1-8, allowedDomains?, deniedDomains? }`, `executeStream` progress events.
- [critical] **R2 — Backend abstraction with safe default:** `tools.websearch.backend: "off" | "hosted" | "provider"` — v1 default `off`; in `off` mode the tool executes and returns an actionable error (how to enable), it does not disappear from the registry (discoverability). `hosted` requires no user key.
- [high] **R3 — Bounded output:** max 8 results, snippet ≤ 300 chars, total payload ≤ 4K chars before context entry; domains filtered by allow/deny lists; every URL returned passes `safeBrowserUrl` + `resolvePinnedBrowserTarget` normalization (`packages/tools/src/browser/security.ts`) so downstream `web_fetch`-style use inherits pinning.
- [high] **R4 — Egress guards:** hosted/provider endpoints are compiled-in constants, NOT project-configurable (URL-credential/exfil class, same reasoning as provider `baseUrl` stripping); requests reject private/loopback hosts with the same private-origin rules the browser stack enforces (`parsePrivateOriginAllowlist` semantics; `WRONGSTACK_BROWSER_PRIVATE_ORIGINS`-style exact allowlist reserved for tests).
- [medium] **R5 — Audit and hygiene:** query, backend, and result count logged to the session; snippets pass the secret scrubber before model context; per-session rate limit with a friendly `sandbox_denied`-style structured error on breach.
- [low] **R6 — MCP coexistence:** builtin name `web_search` does not shadow `mcp__<server>__*` search tools; docs note the precedence.

## Architecture

- Tool lives in `packages/tools` (builtin pack, lazy where the surface requires); backend interface in `packages/providers` (one HTTP client, compiled-in endpoint table).
- Bounds enforcement is a post-stage of `executeStream` before the `final` event — results never enter context unbounded.
- Secret handling: `provider` backend reads keys via SecretVault/env indirection only; no plaintext key may appear in config files, session logs, or tool results.

## Conflict analysis (existing layers)

- **Permission pipeline (`tool-executor.ts` L218):** `confirm` classification means non-YOLO runs prompt for each search (acceptable: search is infrequent and user-initiated in most flows); YOLO auto-allows consistent with all network tools. Read-only classification keeps it eligible for parallel execution under the `smart` strategy.
- **Browser guard (`BrowserNetworkGuardProxy`, `assertBrowserUrlAllowed`):** the guard proxy is bound to browser contexts and is NOT reused for the search egress (different transport); instead the spec reuses the *functions* — `safeBrowserUrl`, `resolvePinnedBrowserTarget`, private-host rejection — for any result URL the agent subsequently fetches. This keeps one URL-safety implementation while avoiding coupling search availability to browser installation.
- **Brain:** no interaction — plain tool approval, no decision-contract surface.
- **Hooks:** standard `PreToolUse` applies (a `deny` hook can block search); sandbox (plan 28) interplay: in container tier v1, `browser_*` are disabled but `web_search` remains available through the host process — intentional, documented.
- **In-project config security:** `tools.websearch.backend` value `hosted`/`off` is benign (endpoints compiled in) → allowed; `endpoint`/`apiKey` overrides in project config must be stripped (exfil class) — nested deny guards + `assertInProjectAllowListComplete` update.
- **Compactors:** bounded output (R3) keeps the existing elision thresholds irrelevant for typical results; no compaction changes.

## Acceptance criteria

1. `off` mode: tool listed, executes, returns actionable enable-guidance error; zero network calls (asserted by client stub).
2. Policy test: non-YOLO run prompts on first `web_search`; YOLO run auto-executes; both audited.
3. Bounds test: a backend stub returning 50 results × 2K-char snippets yields ≤ 8 results, ≤ 300-char snippets, ≤ 4K total.
4. Guard tests: result URL normalization rejects private/loopback hosts; hosted endpoint table is a compile-time constant (no config override path).
5. Scrubber test: a snippet containing a fake API key enters context scrubbed and appears raw in the session log per the raw-tool-I/O invariant.
6. Config test: project-scope `tools.websearch.endpoint`/`apiKey` stripped with warning; `backend`/`enabled` survive.
7. Integration smoke (gated `WRONGSTACK_WEBSEARCH_INTEGRATION=1`): one live hosted query returns ≥ 1 result end-to-end.

## Task graph

See `first-party-web-search.task-graph.json`. Critical path: **T1 → T2 → T3 → T4**. Parallel: T3 ∥ T4 after T2; T5 (provider backend) optional after T2; T6 docs/flip-criteria last.

**Source evidence:** OpenCode hosted zero-key search + permission-key integration (`opencode.md` §4); Gemini Google-Search grounding (`gemini-cli.md` §4); seam functions verified in-repo 2026-10-04 (`packages/tools/src/browser/security.ts`).
