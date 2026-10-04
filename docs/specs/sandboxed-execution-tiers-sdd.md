# Spec: Sandboxed Execution Tiers (plan 28)

**Status:** Proposed · **Source:** `docs/competitive-roadmap-2026-2027/28-sandboxed-execution-tiers.md` · **Date:** 2026-10-04 · **Template:** feature

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
