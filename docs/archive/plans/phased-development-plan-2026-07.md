# Phased Development Plan — 2026-07

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


**Generated:** 2026-07-15
**Scope:** WrongStack monorepo — 18 packages, ~20K tests
**Source inputs:**
- Kanban board: Session sess_01KXKKX (tasks 1–3)
- System-wide scan (2026-07-15): typecheck, dependency health, lint, dead code, test health, git metadata
- Refactoring Roadmap Q3 2026 (`docs/archive/plans/roadmap-2026-07-refactoring.md`)
- Security Hardening Plan (`docs/archive/plans/security-hardening-2026-06.md`)
- WebUI Operator Workbench (`docs/plans/webui-operator-workbench-2026-07.md`)
- Chimera review findings (powerline-rail, auth.ts, surface-aware ports)
- Lint-gate Windows fix

---

## Phase Structure

Each phase has:
- **Priority:** P0 (blocking) → P4 (nice-to-have)
- **Dependencies:** what must be done before this phase
- **Acceptance criteria:** measurable pass/fail conditions
- **Verification steps:** commands and checks to validate completion

Phases are sequenced by dependency chain. Within a phase, items can be parallelized.

---

## Phase 0 — Emergency Fixes & Safety Nets

**Priority:** P0 (blocking)
**Dependencies:** None
**Estimated effort:** 1–2 days
**Risk:** HIGH — unfixed issues cause test failures, no-op lint-gate on Windows, and type errors

### Items

#### 0.1 — Fix failing test: lifecycle banner string
**Kanban ref:** n/a (chimera finding)
**Target:** `packages/webui-server/tests/lifecycle.test.ts`
**Task:** Update `"WebUI ready"` assertion to `"SimpleUI ready"` after surface-aware port allocation work.
**AC:** The single failing test passes: `banner prints correct surface name`.
**Verify:** `pnpm --filter @wrongstack/webui-server test`
**Fix:** ✅ Already implemented by peer leader per system-wide scan.

#### 0.2 — Fix `server-runtime.ts` missing `surface` field
**Kanban ref:** chimera finding
**Target:** `packages/webui-server/src/server/server-runtime.ts`
**Task:** Propagate `surface` parameter to `registerInstance()` call — currently missing after surface-aware port allocation.
**AC:** All 3 typecheck errors in `server-runtime.ts` resolve; `registerInstance()` records surface correctly.
**Verify:** `pnpm --filter @wrongstack/webui-server typecheck`
**Depends on:** None

#### 0.3 — Fix powerline-rail.tsx width budgeting (2 Medium findings)
**Kanban ref:** chimera finding
**Target:** `packages/tui/src/components/powerline-rail.tsx`
**Tasks:**
  1. Fix monochrome mode: count boundary glyph exactly once (lines 56–61)
  2. Include omission marker width in segment admission checks (lines 58–67, 79, 112)
**AC:** Rail never exceeds terminal `budget`; monochrome mode drops correct segments.
**Verify:** `pnpm --filter @wrongstack/tui test`
**Depends on:** None

#### 0.4 — Fix lint-gate `cwd` propagation (2 High findings)
**Kanban ref:** chimera finding from lint-gate review
**Target:** `packages/plugins/src/lint-gate/index.ts`
**Tasks:**
  1. Capture `cwd` in `setup()` and pass to `detectLinter`, `lintContent`, `runCommand`, `lintAndFix`
  2. Construct fix arguments from resolved binary entry, not npx-style args
**AC:** Lint-gate typechecks clean; local Biome detection works correctly on Windows.
**Verify:** `pnpm --filter @wrongstack/plugins typecheck && pnpm --filter @wrongstack/plugins test -- --grep "lint-gate"`
**Depends on:** Already fixed per leader's status messages.

---

## Phase 1 — Session Kanban Tasks

**Priority:** P1 (high)
**Dependencies:** Phase 0 (clean baseline)
**Estimated effort:** 2–3 days
**Risk:** MEDIUM — Telegram plugin surfaces and gaps need documentation

### Items

#### 1.1 — Map Telegram plugin surfaces (Kanban Task 1)
**Kanban ref:** `fefb3ff8-b443-4499-9267-30a2112df2d1`
**Target:** `packages/telegram/`
**Task:** Document all source, configuration, commands, tests, and documentation surfaces of the Telegram plugin.
**AC:** Complete surface map covering: bot.ts entry points, config schema, all slash commands, test coverage matrix, and documentation delta.
**Verify:** Review output saved to `docs/notes/telegram-surface-map.md`
**Depends on:** Phase 0

#### 1.2 — Evaluate security/reliability/API gaps (Kanban Task 2)
**Kanban ref:** `eacc5c3e-5ef6-4db4-8699-345e2cc22e31`
**Target:** `packages/telegram/`
**Task:** Assess Telegram plugin for: security vulnerabilities, reliability issues, API compliance, observability gaps, developer experience gaps.
**AC:** Documented gap analysis with severity ratings and concrete fix recommendations.
**Verify:** Review output saved to `docs/reports/telegram-gap-analysis.md`
**Depends on:** Phase 1.1 (surface map)

#### 1.3 — Implement Telegram fixes from gap analysis
**Kanban ref:** n/a (follow-up)
**Target:** `packages/telegram/`
**Task:** Fix all High+ findings from gap analysis.
**AC:** All High+ findings resolved; existing tests pass; new tests cover fixes.
**Verify:** `pnpm --filter @wrongstack/telegram test`
**Depends on:** Phase 1.2

---

## Phase 2 — Git & Metadata Hygiene

**Priority:** P1 (high)
**Dependencies:** Phase 0
**Estimated effort:** 0.5–1 day
**Risk:** LOW — mechanical cleanup with rollback option

### Items

#### 2.1 — Push 9 local commits
**Task:** Push unpushed commits to remote.
**AC:** `git log --oneline origin/main..HEAD` is empty.
**Verify:** `git push`
**Depends on:** None

#### 2.2 — Add version tags
**Task:** Tag current state with semantic version; adopt tag-per-release cadence.
**AC:** `git tag -l` has tags covering recent releases; release process documents tag convention.
**Verify:** `git tag -l | tail -5`
**Depends on:** Phase 2.1

#### 2.3 — Prune 6 stale branches
**Task:** Delete local branches with `[gone]` upstream.
**AC:** `git branch -v | grep '\[gone\]'` is empty.
**Verify:** `git branch -d <branch>` for each stale branch
**Depends on:** None

#### 2.4 — Lockfile consolidation (pnpm dedupe)
**Task:** Run `pnpm dedupe` to consolidate ~30 stale transitive entries and 3 duplicate `@types/node` versions.
**AC:** `pnpm dedupe --check` exits clean.
**Verify:** `pnpm dedupe --check`
**Depends on:** None

---

## Phase 3 — TUI Quality & Hotspot Reduction

**Priority:** P1 (high)
**Dependencies:** Phase 0
**Estimated effort:** 3–5 days
**Risk:** MEDIUM — large refactoring with risk of regressions in 53-component app.tsx

### Items

#### 3.1 — Powerline-rail width budgeting (from Phase 0.3)
**Note:** Listed in both Phase 0 (emergency) and here — emergency fix first, UI regression polish here.

#### 3.2 — Begin TUI app.tsx decomposition (Roadmap P2.1)
**Target:** `packages/tui/src/app.tsx` (7,600 lines)
**Task:** Extract 53 components into focused panel groups under `packages/tui/src/panels/`.
**AC:** app.tsx < 3,000 lines; all panels have own directory with index export.
**Verify:** TUI builds and all TUI tests pass.
**Depends on:** Phase 3.1

#### 3.3 — Biome warning cleanup (a11y focus)
**Target:** Cross-package (primarily webui, webui-hq, simpleui)
**Task:** Address ~44 Biome warnings, prioritizing ~15 a11y issues in MemoryManager/index.tsx (label/control associations).
**AC:** Biome warning count reduced by ≥80% from baseline.
**Verify:** `pnpm lint` — track warning count.
**Depends on:** None (can parallelize with Phase 3.2)

---

## Phase 4 — Architecture & Core Quality

**Priority:** P2 (medium)
**Dependencies:** Phases 0–2
**Estimated effort:** 2–3 weeks
**Risk:** HIGH — touches core package, coordination layer, export surface

### Items

#### 4.1 — Reduce @wrongstack/core export surface
**Kanban ref:** Roadmap P1.8
**Target:** `packages/core/src/index.ts`
**Task:** Move `security/*` and `coordination/*` modules behind subpath exports.
**AC:** Top-level exports < 60 (from 111); internal modules import from subpath.
**Verify:** `pnpm --filter @wrongstack/core build` + `pnpm --filter @wrongstack/core test`
**Depends on:** Phase 0

#### 4.2 — Hardened catch blocks
**Kanban ref:** Roadmap P1.7
**Target:** Cross-package
**Task:** Add explicit `logger` param and structured error handling to bare `catch(()=>{})` blocks (~96 sites).
**AC:** Zero bare `catch(()=>{})` blocks remain in production code.
**Verify:** `grep -r "catch(()" packages/*/src/` returns empty.
**Depends on:** Phase 0

#### 4.3 — Complete console.log→Logger migration
**Kanban ref:** Roadmap P1.6
**Target:** `packages/core/src/*`
**Task:** Replace remaining 60→0 direct `console.*` calls with structured `Logger`.
**AC:** `grep -r "console\.\(log\|warn\|error\)" packages/core/src/` returns empty.
**Verify:** Review + typecheck.
**Depends on:** Phase 4.2

#### 4.4 — Add façade-module cap rule
**Kanban ref:** Roadmap P1.2
**Target:** `hotspot-guardrails.test.ts`
**Task:** Add ratcheting guardrail: any module with ≥30 exports triggers a test failure unless explicitly opted in.
**AC:** Test fails when a new module exceeds 30 exports.
**Verify:** `pnpm --filter @wrongstack/core test -- --grep "façade"`
**Depends on:** Phase 4.1

---

## Phase 5 — WebUI Operator Workbench

**Priority:** P2 (medium)
**Dependencies:** Phase 0, Phase 3 (TUI decomposition provides patterns)
**Estimated effort:** 2–3 weeks
**Risk:** MEDIUM — UI with cross-package dependencies

### Items

#### 5.1 — Shell decomposition (WebUI Phase 1)
**Kanban ref:** `docs/plans/webui-operator-workbench-2026-07.md`
**Target:** `packages/webui/src/App.tsx`
**Task:** Extract shell responsibility from App.tsx and feature components. Consolidate overlaid panels into Radix-based layout.
**AC:** Shell is a stable layout; each feature component owns only its domain.
**Verify:** WebUI builds; E2E tests pass.
**Depends on:** None (independent workstream)

#### 5.2 — Right inspector as overlay
**Target:** `packages/webui/src/components/`
**Task:** Right inspector opens as overlay (never resizes chat, Monaco, diff, Kanban, SDD, Fleet Map, or terminal content).
**AC:** Opening right inspector produces zero layout shift in main content area.
**Verify:** Chromium E2E assertion on content container width.
**Depends on:** Phase 5.1

#### 5.3 — Chromium E2E coverage for mobile/responsive
**Target:** `e2e/`
**Task:** Add mobile geometry and keyboard tab contract tests.
**AC:** E2E suite includes mobile viewport tests.
**Verify:** `pnpm e2e`
**Depends on:** Phase 5.1

---

## Phase 6 — Security Hardening

**Priority:** P2 (medium)
**Dependencies:** Phase 0 (clean baseline), Phase 4.1 (export surface)
**Estimated effort:** 1–2 weeks
**Risk:** MEDIUM — architectural change to authorization model

### Items

#### 6.1 — Introduce Tool Capability Tags (Security P1)
**Kanban ref:** `docs/archive/plans/security-hardening-2026-06.md` P1.1
**Target:** `packages/core/src/security/permission-policy.ts`, Tool interface
**Task:** Add `capabilities?: string[]` field to Tool. Define capability constants (`fs.write`, `shell.arbitrary`, `net.outbound`, `mcp.proxy`, `subagent.spawn`). Update `AutoApprovePermissionPolicy` to work primarily off capabilities.
**AC:** Every built-in tool declares capabilities; policy checks capabilities instead of exact names.
**Verify:** Permission policy tests pass with capability-based rules.
**Depends on:** Phase 4.1

#### 6.2 — AI-assisted migration of authorization points
**Kanban ref:** Security P1.2
**Target:** Cross-package — plugin API, tool registry, MCP proxy
**Task:** Migrate remaining name-string denylists to capability checks.
**AC:** All `DENY` name checks replaced with capability checks.
**Verify:** Review + test pass.
**Depends on:** Phase 6.1

#### 6.3 — MCP TLS certificate verification
**Kanban ref:** L-6 (bugs.md)
**Target:** `packages/mcp/src/transport.ts`
**Task:** Enforce `rejectUnauthorized: true` by default; document overrides.
**AC:** All MCP HTTP transports verify TLS by default.
**Verify:** MCP tests pass.
**Depends on:** None

---

## Phase 7 — Testing & Coverage Expansion

**Priority:** P3 (lower)
**Dependencies:** Phase 0, Phase 4
**Estimated effort:** 2–3 weeks (ongoing)
**Risk:** LOW — additive work

### Items

#### 7.1 — Expand TUI integration coverage (Roadmap P1.3)
**Target:** `packages/tui/tests/`
**Task:** Add mount + interaction tests for core TUI components.
**AC:** TUI test count increases by ≥30%.
**Verify:** `pnpm --filter @wrongstack/tui test -- --coverage`
**Depends on:** Phase 3.2 (decomposed app.tsx enables component-level tests)

#### 7.2 — Expand CLI boot/dispatch tests (Roadmap P1.4)
**Target:** `packages/cli/tests/`
**Task:** Add integration tests for CLI boot, subcommand dispatch, and surface launcher.
**AC:** CLI test count increases by ≥50%.
**Verify:** `pnpm --filter @wrongstack/cli test -- --coverage`
**Depends on:** Phase 0

#### 7.3 — Lint-gate platform tests: fix-mode coverage
**Kanban ref:** chimera finding
**Target:** `packages/plugins/tests/lint-gate-platform.test.ts`
**Task:** Add `mode: 'fix'` test asserting fix execution uses `process.execPath`, resolved binary, `cwd`, and `shell: false`.
**AC:** New test passes on Windows and Linux.
**Verify:** `pnpm --filter @wrongstack/plugins test -- --grep "lint-gate-platform"`
**Depends on:** Phase 0.4

---

## Phase 8 — Developer Experience & Observability

**Priority:** P3 (lower)
**Dependencies:** Phase 4, Phase 6
**Estimated effort:** 1–2 weeks
**Risk:** LOW

### Items

#### 8.1 — Notification & status notification improvements
**Target:** `packages/core/src/coordination/`
**Task:** Improve subagent lifecycle notifications; add budget-pressure warning broadcasts.
**AC:** Agents broadcast budget pressure ≥threshold; leader can observe fleet health.
**Verify:** Integration test with mock subagent.

#### 8.2 — Config history ownership hardening
**Kanban ref:** M-4 (bugs.md)
**Target:** `packages/cli/src/config-history.ts`
**Task:** Verify UID ownership on all write paths.
**AC:** All write operations check UID ownership before mutating config history files.
**Verify:** Security test passes for UID mismatch scenario.

#### 8.3 — Dead-code cleanup from scan results
**Kanban ref:** system-wide scan
**Target:** Cross-package
**Task:** Review 4,309 flagged exports; remove ~645 genuine dead exports (15% after barrel re-export filtering).
**AC:** Core flagged exports reduced by 50%.
**Verify:** Re-run dead-code scan and compare.

---

## Phase 9 — Process & Documentation

**Priority:** P4 (ongoing)
**Dependencies:** All previous phases (documents reflect current state)
**Estimated effort:** Ongoing (0.5 day every 2 weeks)
**Risk:** LOW — documentation debt

### Items

#### 9.1 — Architecture documentation updates
**Target:** `docs/architecture.md`, `docs/architecture-rules.md`
**Task:** Keep architecture docs in sync with refactoring; document capability-based authorization model.
**AC:** Architecture docs reflect current state after each major phase.

#### 9.2 — Weekly audit schedule
**Target:** CI workflows
**Task:** Add weekly scheduled audit workflow (pnpm audit + dependency check).
**AC:** Workflow exists; notifications trigger on moderate+ advisories.

#### 9.3 — Release process automation
**Target:** `docs/release.md`, CI workflows
**Task:** Formalize release checklist: version bump → changelog → tag → build → publish.
**AC:** `pnpm release:check` passes before every release.

---

## Dependency Graph

```
Phase 0 (Emergency Fixes)
   │
   ├──→ Phase 1 (Session Kanban: Telegram)
   │       │
   │       └──→ 1.1 Surface Map → 1.2 Gap Analysis → 1.3 Implement Fixes
   │
   ├──→ Phase 2 (Git & Metadata Hygiene)
   │       │
   │       ├──→ 2.1 Push Commits
   │       ├──→ 2.2 Version Tags
   │       ├──→ 2.3 Prune Branches
   │       └──→ 2.4 pnpm dedupe
   │
   ├──→ Phase 3 (TUI Quality)
   │       │
   │       ├──→ 3.1 Powerline-rail Fix
   │       ├──→ 3.2 app.tsx Decomposition ← depends on 3.1
   │       └──→ 3.3 Biome Warnings (parallel)
   │
   ├──→ Phase 4 (Core Architecture) ← depends on Phase 0, Phase 2
   │       │
   │       ├──→ 4.1 Export Surface Reduction
   │       ├──→ 4.2 Catch Block Hardening
   │       ├──→ 4.3 Console→Logger (parallel with 4.2)
   │       └──→ 4.4 Façade Cap Rule
   │
   ├──→ Phase 5 (WebUI Workbench) ← depends on Phase 0, Phase 3
   │       │
   │       ├──→ 5.1 Shell Decomposition
   │       ├──→ 5.2 Right Inspector Overlay
   │       └──→ 5.3 E2E Coverage
   │
   ├──→ Phase 6 (Security Hardening) ← depends on Phase 0, Phase 4
   │       │
   │       ├──→ 6.1 Tool Capability Tags
   │       ├──→ 6.2 Auth Migration
   │       └──→ 6.3 MCP TLS (parallel)
   │
   ├──→ Phase 7 (Testing) ← depends on Phase 0, Phase 3, Phase 4
   │       │
   │       ├──→ 7.1 TUI Tests
   │       ├──→ 7.2 CLI Tests
   │       └──→ 7.3 Lint-Gate Platform Tests
   │
   ├──→ Phase 8 (Developer Experience) ← depends on Phase 4, Phase 6
   │
   └──→ Phase 9 (Documentation) ← depends on all
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 3.2 (app.tsx decomposition) breaks TUI | Medium | High | Work against a feature branch; keep existing app.tsx as fallback until decomposition stabilizes |
| Phase 4.1 (export reduction) breaks downstream imports | Medium | High | Use subpath exports for gradual migration; keep re-exports until consumers update |
| Phase 6 (security hardening) introduces regression in permission checks | Low | Critical | Comprehensive permission policy test suite must pass before merge |
| Phase 0.3 (powerline width) cascades into adjacent UI components | Low | Medium | Focused unit test on width calculation; visual snapshot validation |
| Multiple phases modify same files (e.g., app.tsx in Phase 3 and Phase 5) | Medium | Medium | Coordinate via Kanban ownership; use mail_send broadcasts before starting each phase |
| Kanban task ownership collision (Task 3 is this plan; Tasks 1–2 active) | Low | Low | All three tasks are distinct surfaces; no file overlap |

---

## Verification Command Reference

| Check | Command |
|-------|---------|
| Typecheck all packages | `pnpm -r typecheck` |
| Run all tests | `pnpm test` |
| Run specific package tests | `pnpm --filter @wrongstack/<pkg> test` |
| Lint check | `pnpm lint` (Biome) |
| Lint gate status | `lint_gate_status` tool |
| Dependency audit | `pnpm audit --audit-level=moderate` |
| Dedupe check | `pnpm dedupe --check` |
| Dead code scan | `dead_code_scan` tool |
| Lockfile stale entries | `pnpm outdated` |
| Unpushed commits | `git log --oneline origin/main..HEAD` |
| Stale branches | `git branch -v \| grep '\[gone\]'` |
