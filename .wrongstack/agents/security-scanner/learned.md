# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-23T20:06:16.765Z; skill=security-scanner -->
- **When reviewing a new `ToolCapabilities` constant, never trust the doc comment — verify the enforcement chain: (1) the tool actually declares the capability in `capabilities: [...]`, (2) `WIDE_SUBAGENT_CAPABILITIES` / `DANGEROUS_FOR_SUBAGENTS` membership in `packages/core/src/security/capabilities.ts`, (3) `AutoApprovePermissionPolicy.evaluate` in `packages/core/src/security/auto-approve-policy.ts`, which denies tools with no capability intersecting the subagent grant — `.some()` semantics mean a tool passes if ANY declared capability is allowed, so a single-purpose tool loses its restriction…**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `ToolCapabilities`
  - *How:* `capabilities: [...]`
  - *How:* `WIDE_SUBAGENT_CAPABILITIES`
  - *How:* `DANGEROUS_FOR_SUBAGENTS`
  - *How:* `packages/core/src/security/capabilities.ts`
  - *How:* `AutoApprovePermissionPolicy.evaluate`
  - *How:* `packages/core/src/security/auto-approve-policy.ts`
  - *How:* `.some()`

---
*Last capture: 2026-09-23T20:06:16.765Z · 1 entries*
