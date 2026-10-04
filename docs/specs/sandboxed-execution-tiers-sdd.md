# Spec: Sandboxed Execution Tiers (plan 28)

**Status:** Partial — T1–T9 + T5.1 helper prototype complete; native N-API addon hardening is the follow-up · **Source:** `docs/competitive-roadmap-2026-2027/28-sandboxed-execution-tiers.md` · **Date:** 2026-10-04 · **Template:** feature

## Overview

Add a real isolation layer beneath the existing approval policy so that mutating and network-capable tool calls can be contained independently of prompts. Three tiers (`read-only`, `workspace-write`, `full-access`) are enforced at a shared exec choke point by pluggable backends (policy-only, container, Windows-native), and a sandbox denial can be converted into a one-call elevation ("expansion request") through the existing approval pipeline. Default configuration changes nothing.

## Requirements

- [critical] **R1 — No-config, no-change:** with `tools.sandbox` unset, runtime behavior is byte-identical to today; verified by replaying an existing tool-executor test corpus with the sandbox middleware present but mode `off`.
- [critical] **R2 — Tier contract:** `tools.sandbox = { mode: "off" | "enforced", tier: "read-only" | "workspace-write" | "full-access", writableRoots: string[] }`, resolved per session; the exec choke point shared by `bash`, `exec`, `git` and MCP exec wrappers enforces the tier before spawn.
- [high] **R3 — Container backend:** Docker/Podman execution with the workspace bind-mounted at the identical absolute path, network denied by default, and `writableRoots` mounted read-write.
- [high] **R4 — Windows-native backend:** spawned exec processes constrained by icacls low-integrity markings on the workspace subtree; documented caveat that integrity labels persist on created files with the reset command (`icacls <path> /setintegritylevel Medium`); explicitly not a security boundary against admins.
- [high] **R5 — Expansion request:** a sandbox denial produces an approval prompt naming the missing path or egress; approval elevates for that single call only; the session log records `sandbox.expansion_requested` and the outcome.
- [medium] **R6 — Fleet inheritance:** subagents inherit the leader's tier; an explicit per-spawn override is honored and visible in `/fleet status`.
- [low] **R7 — Surface indicators:** CLI/TUI/WebUI show the active tier and backend in session status.

## Architecture

- New package section `packages/core/src/sandbox/`: `types.ts` (tier contract), `manager.ts` (resolution + audit), `backends/policy-only.ts`, `backends/container.ts`, `backends/windows-native.ts`.
- Enforcement point is the **exec-layer choke point**: a shared wrapper applied to the exec-family builtins in `packages/tools` and to MCP exec wrappers — deliberately NOT inside `ToolExecutor`, which stays sandbox-agnostic. The wrapper runs after hook mutation so it sees final, parsed arguments.
- Denials surface as a tool error with `kind: "sandbox_denied"` plus a structured `missing` payload (paths/egress) — this is what R5's prompt renders.
- Expansion approvals reuse `permissionPolicy.evaluate` with an expansion decision kind; no new Brain option contract.

## Spawn-routing design (T4)

- The choke point performs **input-rewrite routing**: after a backend `allow`, `wrap.ts` hands bash (shell form) and exec (argv form) inputs to `backend.routeExec` and calls the real tool with the rewritten input. The backend never executes anything itself.
- bash: `docker run --rm --network none [-v <p>:<p>[:ro]]… -w <cwd> <image> sh -lc '<command>'` (inner command single-quote escaped).
- exec: `docker run --rm --network none [-v …] -w <cwd> <image> <command> <args…>` (no shell inside).
- Same-absolute-path mounts: `-v <p>:<p>` for cwd plus `writableRoots` in the `workspace-write` tier; in the `read-only` tier only the cwd is mounted (as `:ro`) and `writableRoots` are not mounted at all. Outside-root writes land in the container's ephemeral filesystem — the observable AC2 guarantee is "no host file outside the root is created", not a `sandbox_denied` error class.
- Deny-by-default network: `--network none` on every container.
- `full-access` and `policy-only` never route. `git`/`pwsh` are not routed in T4.1 and remain host-executed under the standard approval path (documented limitation); MCP exec wrappers are a separate seam.
- Fail-closed: a missing `tools.sandbox.image` or an unavailable `docker` runner denies with an actionable reason. `tools.sandbox.image` is in-project-denied like `tools.sandbox.backend` (RCE class).
- `browser_*` tools are gated at registration (`createSandboxBrowserTierGate`): under enforced+container they deny with `sandbox_denied` — deny-by-default network and the image's missing browser make them unusable.

## Windows-native enforcement design (T5)

- Mirrors T4's input-rewrite model: the backend never executes anything; `wrap.ts` applies the returned route. `backendFor` selects it for `backend: 'windows-native'`.
- **Decision-builder (pure, always-run):** `buildWindowsAclPlan(config)` — `workspace-write` emits one icacls grant argv per `writableRoots` entry (`icacls <root> /grant WrongStackSandbox:(OI)(CI)M`) plus the `lowIntegrityDirs` list (writable roots to mark Low IL so a Low-integrity token may write them); `read-only`/`full-access` emit no grants (read-only relies on mandatory integrity policy — no writable grant exists anywhere).
- **Routing:** bash (shell form) → `cmd.exe /d /s /c "<command>"` (cmd double-quote escaping); exec (argv form) → `cmd.exe /d /s /c <command> <args…>`. `git`/`pwsh` are **not routed** (same T4.1 host-executed contract); `full-access` never routes.
- **Restricted-token reality (honest v1 boundary):** minting a true restricted token requires the native sandbox helper (**T5.1**). Until a helper runner is configured, `enforceExec` **fails closed** with an actionable reason — it never degrades to same-user host execution, because deny/grant ACEs for the *same* user are a no-op and would be a half-truth sandbox. The ACL plan is the helper's input contract; the gated integration suite proves the plan's icacls mechanics on a real temp directory (grant, verify, Low-IL mark, cleanup), not host containment.
- Fail-closed matrix: non-win32 host → actionable deny; helper runner unconfigured → actionable deny (`T5.1`); `full-access` → allow. No new config fields, so the T8 in-project classification is unchanged.

## Windows-native helper design (T5.1)

- **Contract v2:** `SandboxBackend.applyHelper?(route): Promise<SandboxRoute | void>` — runs after `routeExec` and may return a **transformed route** (the payload wrapped in the restricted-token launcher); `void` keeps the original. `SandboxExecCall` also carries the per-agent `config` so backends gate and route on the SAME config (split-brain fix: a tightening override can never fail-open).
- **Helper (shipped prototype, `runas` variant):** `defaultWindowsHelperRunner()` transforms the route into `runas /trustlevel:0x20000 <payload>` — Windows derives a Basic-User restricted token (strips elevation/installer groups) for the SAME user; the runner first marks the writable roots Low integrity (`icacls /setintegritylevel L`). Design evidence: the direct Safer P/Invoke chain (SaferCreateLevel → SaferComputeTokenFromLevel) fails with ERROR_INVALID_PARAMETER (87) on current Windows builds on this host (micro-probe, all scope/level combinations), while `runas /trustlevel` — the same Safer infrastructure shipped as a Windows binary — works (gated probe: exit 0, file landed).
- **Containment proof (gated):** the integration suite applies an explicit **deny ACE** for the spawning user on a sensitive temp dir, runs the deny route through the helper, and polls the filesystem: no file ever appears; the same launcher writes into the Low-IL workspace successfully. The launcher is detached — the payload's exit code and stdio do NOT propagate through `runas` (documented v1 boundary; the native N-API addon is the hardening path for full stdio/exit propagation).

## Conflict analysis (existing layers)

- **Permission pipeline** (`packages/core/src/execution/tool-executor.ts` — `permissionPolicy.evaluate` at L218, boundary coercion at L233): the sandbox sits *below* policy. A policy `deny` always wins and is never converted to an expansion request; conversely a sandbox denial never becomes a policy allow. Precedence matrix: policy deny > hook deny > sandbox denial > approval > YOLO.
- **Hooks:** `PreToolUse` `mutate` composes before validation, so the sandbox wrapper sees post-mutation input — a mutated command cannot escape containment. `allow`/`mutate` hooks cannot raise the tier; only R5's approval can.
- **Destructive kinds** (`packages/core/src/security/yolo-risk.ts` — `ALL_DESTRUCTIVE_KINDS`, `LOCKED_DESTRUCTIVE_KINDS`): unchanged and tier-independent; `agent-state` and `credential-bind` stay locked, the seven user-owned kinds still prompt in every tier including `full-access` under YOLO.
- **Brain:** expansion approvals ride the standard approval path and tier chain (policy → LLM tier → human); `BrainMonitor` will see `sandbox_denied` storms as ordinary tool-failure streaks and may steer — accepted behavior, no new decision contract.
- **Browser guard** (`packages/tools/src/browser/`: `BrowserNetworkGuardProxy`, `assertBrowserUrlAllowed`, `resolvePinnedBrowserTarget`, `parsePrivateOriginAllowlist`): complementary, not redundant. The container backend's deny-by-default network would break the loopback guard proxy; therefore **v1 disables `browser_*` tools inside container-tier runs** (documented), and the guard stack keeps owning browser egress in unsandboxed runs.
- **In-project config security (`stripUnsafeInProjectFields`):** `tools.sandbox.mode` and `tier` are benign preferences → allowed (they can only tighten containment). Denied via `IN_PROJECT_DENIED_PATHS`: `tools.sandbox.backend` (selects the exec backend; container variants will grow image/CLI overrides — RCE class) and `tools.sandbox.writableRoots` (bind-mounts host paths read-write — host-path injection class, same precedent as `Sage.storage.directory`). `assertInProjectAllowListComplete` updated in the T8 test.

## Acceptance criteria

1. `pnpm --filter @wrongstack/core test -- sandbox` passes, including a replay fixture proving R1 equivalence (policy-only backend, mode `off`, zero outcome deltas vs recorded baseline).
2. Docker integration (gated `WRONGSTACK_SANDBOX_INTEGRATION=1`): in `workspace-write`, `bash("echo x > ../outside.txt")` fails with `sandbox_denied` + audit event; the same write inside the root succeeds; `writableRoots` targets succeed.
3. Expansion flow: a denial surfaces a prompt naming the exact missing path; approval executes that call once; the session JSONL contains request, decision, and outcome events.
4. YOLO enabled + `workspace-write`: a DestructiveKind-classified call still prompts (policy precedence test).
5. Fleet test: a subagent spawned without override runs in the leader's tier; with override, in its own; `/fleet status` shows both.
6. Config test: a repo-supplied `.wrongstack/config.json` containing `tools.sandbox.backend.image` is stripped with a warning; `tier`/`mode` survive.

## Task graph

See `sandboxed-execution-tiers.task-graph.json`. Critical path: **T1 → T2 → T4** (container backend is the long pole). Parallel after T2: T4 ∥ T5 ∥ T6 ∥ T7; T3 and T8 depend only on T2. Routers: multi-backend platform work stays in this spec; no refactor-planner split needed (single new package section + one choke-point seam).

**Source evidence:** Codex three-tier sandbox + `writable_roots` (`codex-cli.md` §4); Gemini multi-backend sandbox incl. Windows-native icacls mode and "Sandbox Expansion Request" (`gemini-cli.md` §4); seam names verified in-repo 2026-10-04 (`tool-executor.ts`, `yolo-risk.ts`, `packages/tools/src/browser/*`).
