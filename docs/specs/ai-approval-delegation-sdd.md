# Spec: AI Approval Delegation (plan 29)

**Status:** Proposed · **Source:** `docs/competitive-roadmap-2026-2027/29-ai-approval-delegation.md` · **Date:** 2026-10-04 · **Template:** feature

## Overview

Add a third way between prompt-everything and YOLO: an LLM reviewer ("approvals reviewer") gates a configurable subset of approval prompts (e.g. sandbox expansions, side-effecting but non-destructive commands). Humans see only denials, escalations, and low-confidence cases. The reviewer is a new Brain tier member, default-off, fail-closed, and fully audited.

## Requirements

- [critical] **R1 — Opt-in and inert by default:** `autonomy.approvalsReviewer = { enabled: false, model?, maxContextChars? }`; when disabled, runtime behavior is byte-identical to today (replay-verified).
- [critical] **R2 — Eligibility:** only approval prompts whose classification is a plain `confirm` (network egress, writes outside policy boundaries, side-effecting commands) are delegable. Anything in `ALL_DESTRUCTIVE_KINDS` (`packages/core/src/security/yolo-risk.ts`) is never delegated; the `LOCKED_DESTRUCTIVE_KINDS` (`agent-state`, `credential-bind`) are structurally unreachable because they bypass YOLO already.
- [critical] **R3 — Decision contract:** reviewer returns `{ decision: "allow" | "deny" | "escalate", rationale }`; exact-id validation applies (malformed output → escalate + audit, never interpreted leniently). `allow` executes the call; `deny`/`escalate` land in the existing Brain decision queue for the human.
- [high] **R4 — Precedence:** deterministic policy deny always wins; `PreToolUse` hook deny always wins; the reviewer only ever sees calls that reached `confirm` with no higher-priority refusal. The reviewer can never mutate inputs.
- [high] **R5 — Audit and replay:** every delegated decision is recorded as a `brain.decision_*` event with provenance `approvals_reviewer`, the bounded prompt context, verdict, rationale, and model id; replay reconstructs the session without secrets.
- [medium] **R6 — Caps and fail-closed:** per-session rate and cost caps; reviewer unavailability or timeout → escalate to human (never auto-allow).
- [medium] **R7 — Visibility:** `/brain` shows delegated decisions with provenance; TUI/WebUI render them distinctly from human decisions; per-session allow/deny/escalate stats.

## Architecture

- New tier member inside the existing Brain chain (`TOKENS.BrainArbiter` composition in `cli-main.ts`), positioned after the deterministic policy and before human escalation; gated by the live autonomy ceiling (`/brain risk`) — `off` disables the reviewer entirely.
- Eligibility classifier consumes tool metadata (`permission`, `mutating`) plus DestructiveKind classification — no new risk model, reuse `yolo-risk.ts` helpers.
- Decision validation reuses the Brain option contract (exact ids only; free-text matching is already forbidden for option decisions — FleetSupervisor precedent).
- Audit rides the existing `brain.decision_*` EventBus events and session reconstruct set.

## Conflict analysis (existing layers)

- **Permission pipeline (`tool-executor.ts` L218, PreToolUse refusal guard at L205–207):** the reviewer sits strictly downstream of both policy and hooks; it is an evaluator of *pending confirmations*, not a policy authority. A hook `deny` after the reviewer allowed is impossible by construction because reviewer input is only produced after the hook stage concluded without denial.
- **Brain tiers:** the reviewer slots between the LLM autonomy tier and `HumanEscalatingBrainArbiter`; autonomy ceiling semantics are unchanged (`/brain risk off|low|...` governs it like other LLM decisions). No conflict with `ObservableBrainArbiter` event emission — reviewer decisions emit the same `brain.decision_*` events with new provenance.
- **Option decision contract:** reuses the exact-`optionId` requirement; free-text "do not spawn"-style misreads are structurally excluded.
- **In-project config security:** `autonomy.approvalsReviewer` must be added to `KNOWN_DENIED_IN_PROJECT` (same class as `autonomy.yoloConfirm` — otherwise a repo-supplied config could auto-approve its own malicious calls). `assertInProjectAllowListComplete` test updated in T7.
- **FleetSupervisor / option consumers:** unaffected — they already refuse non-exact answers; the reviewer follows the same rule.

## Acceptance criteria

1. Disabled-mode replay: recorded tool-executor corpus produces identical outcomes with the package present, flag off.
2. Precedence matrix unit tests: policy deny × reviewer allow → deny; hook deny × reviewer allow → deny; policy confirm × reviewer deny → human sees deny; × escalate → human queue.
3. Contract tests: malformed reviewer output (missing id, prose decision) → escalate + audit event, zero executions.
4. Eval gate: on a ≥200-prompt replayed fixture corpus, false-allow rate < 2% and false-deny rate < 15% before the flag may default to enabled in a later release (gate encoded as a test).
5. Audit replay: every delegated decision reconstructable from session JSONL without secrets (scrubber applied).
6. Config test: project-scope `autonomy.approvalsReviewer` is stripped with warning.

## Task graph

See `ai-approval-delegation.task-graph.json`. Critical path: **T1 → T2 → T3 → T6** (eval gate). Parallel after T2: T4 ∥ T5; T7 depends on T3.

**Source evidence:** Codex `approvals_reviewer = "auto_review"` (`codex-cli.md` §4); seam names verified in-repo 2026-10-04 (`yolo-risk.ts` exports, Brain composition in `docs/AGENTS.md`).
