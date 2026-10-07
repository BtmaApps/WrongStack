# Learned instructions for `security-scanner`

> Project-specific learning data for the `security-scanner` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-07T15:11:01.855Z; skill=security-scanner -->
- **Always confirm that a security-gate block reason built from accumulated scan state carries only pattern type ids (`patternTypeForGroups` output in `packages/plugins/src/secret-scanner/`) and never the matched substring — a shared `found: Set<string>` accumulates across all windows in `findMatches`, so any reason string derived from it discloses which credential classes a pending write contains even though no secret value leaks.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `patternTypeForGroups`
  - *How:* `packages/plugins/src/secret-scanner/`
  - *How:* `found: Set<string>`
  - *How:* `findMatches`

<!-- learned-stamp: category=warning; capturedAt=2026-10-04T18:45:10.561Z; skipped=17; skippedWins=17 -->
- **Before applying a Chimera-suggested fix in a cascade, re-read the flagged file and check `git diff HEAD` — a parallel worker may have already landed the remediation after the review snapshot; confirm against the live tree, fix only what remains (here: lint debris), and never duplicate a fix that is already present. ```json { "verification_evidence": { "typecheck": { "command": "pnpm exec tsc --noEmit -p packages/core", "exitCode": 0 }, "lint": { "command": "pnpm exec biome check packages/core/src/sandbox/wrap.ts packages/core/tests/sandbox/mcp-gate.test.ts packages/mcp/src/wrap-tool.ts packages/mcp/tests/wrap-tool-sandbox.test.ts packages/mcp/tests/wrap-tool.test.ts", "exitCode": 0 }, "tests": { "command": "pnpm --dir packages/mcp exec vitest run tests/wrap-tool-sandbox.test.ts tests/wrap-tool.test.ts", "exitCode": 0 } } } ```**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `git diff HEAD`
  - *How:* `packages/core/src/sandbox/wrap.ts`
  - *How:* `packages/core/tests/sandbox/mcp-gate.test.ts`
  - *How:* `packages/mcp/src/wrap-tool.ts`
  - *How:* `packages/mcp/tests/wrap-tool-sandbox.test.ts`
  - *How:* `packages/mcp/tests/wrap-tool.test.ts`
  - *How:* `tests/wrap-tool-sandbox.test.ts`
  - *How:* `tests/wrap-tool.test.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:23:22.041Z; skill=security-scanner; applied=7; wins=7; skipped=8; skippedWins=8 -->
- **When a new shared module is intended to replace hand-duplicated security lists, verify the additions actually reached the live lists. Duplicated basename regexes here exist at `packages/core/src/security/permission-helpers.ts:450` and `packages/core/src/security/yolo-state-risk.ts:14`; compare them against the new module for missing entries and for the lingering "keep in sync" comment that the refactor was meant to delete.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/security/permission-helpers.ts:450`
  - *How:* `packages/core/src/security/yolo-state-risk.ts:14`
  - *How:* `packages/core/src/security/permission-helpers.ts`
  - *How:* `packages/core/src/security/yolo-state-risk.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T18:26:23.554Z; skill=security-scanner; applied=1; wins=1; skipped=13; skippedWins=13 -->
- **When a security gate change leaves the existing tests green, treat that as missing coverage, not as evidence. Before accepting a narrowed authorisation rule, confirm each pre-existing security test fixture still exercises a distinct rule and add cases for the paths that lost coverage — a green `tests/security/yolo-risk-state-root.test.ts` after replacing whole-root gating with a list only means its three fixtures survived the list.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `tests/security/yolo-risk-state-root.test.ts`

<!-- learned-stamp: category=warning; capturedAt=2026-10-05T19:35:13.332Z; skill=api-design; applied=4; wins=4; skipped=5; skippedWins=5 -->
- **When introducing an allow-everything mode that must not outrank user refusals, fail closed on rules that could not be evaluated — in `packages/core/src/security/permission-policy.ts` the `denyUnevaluated` refusal before the YOLO+ auto-allow is the pattern that keeps a broad switch from silently outranking a rule the user wrote.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `packages/core/src/security/permission-policy.ts`
  - *How:* `denyUnevaluated`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T18:23:22.041Z; skill=security-scanner; applied=8; wins=8; skipped=7; skippedWins=7 -->
- **Before reporting an authorisation gap in a new security module, verify the live enforcement predicates independently — in this repo `isInsideAgentStateRoot` in `packages/core/src/security/permission-helpers.ts` gates the whole global root with a realpath pass, so a narrower path-regex leaf module cannot be a weakening. Grep the module's own filename to detect zero-importer dead code; a doc comment claiming "shared by X and Y" is evidence to check, not evidence.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `isInsideAgentStateRoot`
  - *How:* `packages/core/src/security/permission-helpers.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T19:35:13.332Z; skill=security-scanner; applied=2; wins=2; skipped=7; skippedWins=7 -->
- **Treat a passing security test as missing coverage when the gate it covers was narrowed: in `packages/core/tests/security/agent-state-sensitivity.test.ts` the fixtures pin both halves of the new predicate, so a green run does not prove the write gate still covers credential filenames the new list forgot.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/tests/security/agent-state-sensitivity.test.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T18:26:23.554Z; skill=security-scanner; applied=8; wins=8; skipped=6; skippedWins=6 -->
- **Verify a narrowed security gate against the credential filenames the codebase actually writes, not against the gate's own list. When replacing a root-wide containment check with a name/subtree classifier in `packages/core/src/security/agent-state-sensitivity.ts`, enumerate the real secrets under the wstack global root (grep `file-permissions.ts`, `ipc-endpoint-secret.ts`, `hq/auth-store.ts` for credential filenames) and assert each against the new predicate — basenames like `runtime.json` and `ipc-endpoint.secret` are easy to miss because they carry no obvious secret name.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/security/agent-state-sensitivity.ts`
  - *How:* `file-permissions.ts`
  - *How:* `ipc-endpoint-secret.ts`
  - *How:* `hq/auth-store.ts`
  - *How:* `runtime.json`
  - *How:* `ipc-endpoint.secret`

<!-- learned-stamp: category=convention; capturedAt=2026-10-07T15:11:01.855Z; skill=security-scanner -->
- **When a guard is reordered relative to evidence collection in a fail-closed gate, verify the new order records evidence before throwing rather than discarding it, and confirm the caller still converts the throw into a block decision — a `throw new SecretScanTimeoutError(...)` inside `scanWindow` is only safe while `buildHook`'s `catch` maps it to `decision: 'block'`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `throw new SecretScanTimeoutError(...)`
  - *How:* `scanWindow`
  - *How:* `buildHook`
  - *How:* `catch`
  - *How:* `decision: 'block'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-05T18:35:43.033Z; skill=security-scanner; applied=6; wins=6; skipped=7; skippedWins=7 -->
- **When a security gate narrows from a broad containment check (e.g. `isInsideAgentStateRoot` over the whole root) to a name/subtree classifier, enumerate the credential filenames the codebase actually writes — grep `packages/persistence/src/file-permissions.ts`, `packages/persistence/src/ipc-endpoint-secret.ts`, and `packages/core/src/hq/auth-store.ts` for secret paths — and assert each against the new predicate. Names like `ipc-endpoint.secret` and `runtime.json` carry no obvious secret word and are the most likely to be missed.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `isInsideAgentStateRoot`
  - *How:* `packages/persistence/src/file-permissions.ts`
  - *How:* `packages/persistence/src/ipc-endpoint-secret.ts`
  - *How:* `packages/core/src/hq/auth-store.ts`
  - *How:* `ipc-endpoint.secret`
  - *How:* `runtime.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-06T15:20:43.723Z; skill=security-scanner; skipped=2; skippedWins=2 -->
- **When an explain/diagnostic function gains a lockdown guard, verify it against the real enforcement predicate in `packages/core/src/security/permission-policy.ts` rather than the explanatory comment, and confirm the guard was applied only to the allow path — session denies in `explainPermissionTrace` must stay unconditional to match "Denies still are" under `--restricted`.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/security/permission-policy.ts`
  - *How:* `explainPermissionTrace`
  - *How:* `--restricted`

---
*Last capture: 2026-10-07T15:11:01.855Z · 11 entries*
