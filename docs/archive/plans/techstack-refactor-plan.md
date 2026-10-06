# TechStack Refactor Plan

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


> **Package:** `@wrongstack/techstack` — v0.295.0
> **Audit Date:** 2026-07-21
> **Status:** Implemented — all four phases completed and verified on 2026-07-21
> **SDD:** `docs/archive/specs/techstack-sdd.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Snapshot](#2-current-architecture-snapshot)
3. [Risk Assessment & Dependency Graph](#3-risk-assessment--dependency-graph)
4. [Phase 1 — High Impact / Low Risk (Quick Wins)](#4-phase-1--high-impact--low-risk-quick-wins)
5. [Phase 2 — Medium Risk (Structural Improvements)](#5-phase-2--medium-risk-structural-improvements)
6. [Phase 3 — High Risk / High Reward (Architectural)](#6-phase-3--high-risk--high-reward-architectural)
7. [Phase 4 — Stretch Goals & Ecosystem Expansion](#7-phase-4--stretch-goals--ecosystem-expansion)
8. [Rollback Strategy](#8-rollback-strategy)
9. [Verification & Success Criteria](#9-verification--success-criteria)
10. [Appendix: Module Risk Matrix](#10-appendix-module-risk-matrix)

---

## 1. Executive Summary

`@wrongstack/techstack` is a cross-language dependency intelligence pipeline — 5,400+ lines of TypeScript across 24 source modules, supporting 13 ecosystems in 3 tier levels. The codebase is well-architected (clean port abstractions, graceful degradation, strong typing) but has accumulated several categories of technical debt:

| Category | Severity | Scope |
|---|---|---|
| **Inline format parsers** | Medium | TOML/YAML/XML parsers hand-rolled with regex; edge-case fragile |
| **Phase 1 stubs** | Low | `discovery/index.ts` has dead code shadowing the real `workspace.ts` |
| **`service.ts` sprawl** | Medium | 709 lines — orchestrator, report generator, finding factory all in one class |
| **Test isolation gaps** | Medium | Adapter tests use real filesystem; native audit tests rely on host tooling |
| **Missing adapter coverage** | Low | Gradle, Swift have no dedicated adapter; Go pseudo-versions skipped |
| **Dual discovery entry-points** | Low | `discovery/index.ts`(stub) vs `discovery/workspace.ts`(real) confuses intent |
| **`triage.ts` encoding** | High | File marked as binary, blocks reading/auditing |

The refactor is phased so incremental value is delivered without a big-bang rewrite.

---

## 2. Current Architecture Snapshot

```
                            ┌──────────────┐
                            │  TechStack    │
                            │  Engine       │  service.ts (709 LoC)
                            │  (orchestrator)│
                            └──────┬───────┘
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                    ▼
         ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
         │  Discovery   │ │  Enrichment  │ │   Research       │
         │  workspace.ts│ │  client.ts   │ │   researcher.ts  │
         │  index.ts*   │ │  osv.ts      │ │   llm.ts         │
         └──────┬───────┘ │  native-     │ │   search.ts      │
                ▼          │  audit.ts   │ │   triage.ts      │
         ┌──────────────┐ └──────┬───────┘ └──────────────────┘
         │  Adapters    │        ▼                 │
         │  (13 files)  │ ┌──────────────┐         │
         │  interface   │ │  Policy      │         │
         │  paths.ts    │ │  status.ts   │         │
         └──────────────┘ └──────────────┘         │
                                                   ▼
                                        ┌──────────────────┐
                                        │   Store + Export │
                                        │   sqlite.ts      │
                                        │   schema.ts      │
                                        │   sbom.ts        │
                                        │   remediation.ts │
                                        │   snapshot-diff  │
                                        │   delivery/      │
                                        └──────────────────┘
```

Key architectural properties:
- **Pipeline phases** (inventory → enrich → research) are sequential but individually skippable
- **Port-based research** (`ResearchLlm`, `ResearchSearch`) makes it unit-testable without a live LLM
- **Evidence chain** — every dependency carries provenance (manifest → lockfile → registry → OSV → agent)
- **Finding type** structurally prevents LLM version fabrication (no `latestStable` field)

---

## 3. Risk Assessment & Dependency Graph

```
Module                Complexity  Coverage  Fan-out  Public API  Risk
──────                ──────────  ────────  ───────  ──────────  ────
service.ts            high        40-60%    high     YES         HIGH
npm.ts                medium      60-80%    low      YES         MEDIUM
client.ts             medium      40-60%    medium   YES         MEDIUM
native-audit.ts       medium      <40%      low      YES         MEDIUM
researcher.ts         medium      60-80%    low      NO          MEDIUM
workspace.ts          low         80%+      low      YES         LOW
purl.ts               low         80%+      medium   YES         LOW
python.ts             medium      60-80%    low      YES         MEDIUM
rust.ts               medium      60-80%    low      YES         MEDIUM
go.ts                 medium      60-80%    low      YES         LOW
status.ts             low         80%+      medium   YES         LOW
adapter interface     low         n/a       high     YES         LOW
sqlite.ts             low         40-60%    low      NO          LOW
delivery/coordinator  low         40-60%    low      NO          LOW
11 remaining adapters low         <40%      low      YES         LOW
triage.ts             unknown     unknown   medium   YES         HIGH(binary)
index.ts (stub)       low         n/a       none     NO          LOW
```

> **Complexity:** cyclomatic + module length heuristic.
> **Coverage:** estimated from test file presence and import analysis.
> **Fan-out:** how many other modules import this one.

### Dependency order for refactoring

```
1. triage.ts (unblock reading/auditing)
2. index.ts stub (safe deletion, no dependents)
3. service.ts → split (most dependents, biggest risk)
4. client.ts → extract parsers (isolated change)
5. native-audit.ts → test host (no code change)
6. researcher.ts → hardening (depends on service split)
7. Adapter improvements (independent per adapter)
8. New adapter additions (independent)
```

---

## 4. Phase 1 — High Impact / Low Risk (Quick Wins)

### 4.1 Fix `triage.ts` binary encoding

**Files:** `src/research/triage.ts`
**Risk:** Low — this is a file-encoding repair, no logic change
**Estimate:** 15 min

- Diagnose why the file reports as binary (UTF-8 BOM? null bytes?).
- Rewrite from the barrel import signatures to reconstruct the file.
- The known exports (from `research/index.ts`) are: `triageCandidates`, `clusterCandidates`, `DEFAULT_TRIAGE_LIMIT`, `TriageOptions`.
- Verify the file is clean UTF-8 with `file` command or re-save.

### 4.2 Consolidate dual discovery entry-points

**Files:** `src/discovery/index.ts`, `src/discovery/workspace.ts`
**Risk:** Low — `index.ts` exports nothing that `workspace.ts` doesn't already provide via `src/index.ts`
**Estimate:** 1 hr

- The Phase 1 stub `discoverWorkspaces()` in `index.ts` (returns `[]`) was the original skeleton.
- The real implementation lives in `workspace.ts` and is the one wired in `service.ts` and `src/index.ts`.
- **Action:** Remove the dead `discoverWorkspaces()` from `index.ts`. Keep `mapEcosystem()`, `deriveCoverage()`, `workspaceId()`, `computeFingerprint()` — those are useful helpers that `workspace.ts` doesn't duplicate.
- Update `src/index.ts` barrel to point to `workspace.ts`'s `discoverWorkspaces`.
- Add a `@deprecated` note or re-export from `index.ts` pointing to `workspace.ts`.

### 4.3 Add encoding-quality fuzz tests for format parsers

**Files:** `src/adapters/npm.ts`, `python.ts`, `rust.ts`, `go.ts`, `dart.ts`, `dotnet.ts`, `php.ts`, `maven.ts`
**Risk:** Low — additive tests, no production code change
**Estimate:** 3-4 hrs

The hand-rolled TOML/YAML/XML parsers are the biggest latent bug surface. Add focused tests:

- **pnpm lockfile:** multiline values, inline comments, `resolution:` with `commit:`, empty `importers:`, workspace protocol `link:../core`
- **Python TOML:** inline tables `dependencies = {flask = ">=2.0"}`, multi-line arrays, quoted keys
- **Cargo.lock:** `source = "registry+https://...`, git dependencies, multiple `[[package]]` with same name
- **go.mod:** `replace` directives, `retract` blocks, `exclude`, windows-path line endings
- **pubspec.yaml:** `sdk: flutter` dependencies, `dependency_overrides`, git dependencies with `ref:`
- **.csproj:** `Condition` attributes, `Include="…" Version="…"` on same element, multi-line elements
- **pom.xml:** inherited versions via `<parent>`, `<dependencyManagement>`, `<properties>`
- **Gemfile.lock:** `GIT` and `PATH` sections alongside `GEM`, multiple sources
- **composer.lock:** abandoned packages, `notification-url`
- **mix.lock:** git dependencies with `{:name, git: "...", "tag": "1.0.0"}` format

Write as `tests/adapters/parser-edge-cases.test.ts`.

### 4.4 Extract adapter path-resolution into shared helper

**Files:** `src/adapters/paths.ts`, all adapter files
**Risk:** Low — mechanical refactor
**Estimate:** 2 hrs

Every adapter duplicates the same pattern:
```typescript
function manifestEvidence(path: string): Evidence { ... }
function lockfileEvidence(path: string): Evidence { ... }
private fileExists(filePath: string): boolean { ... }
```

**Action:**
1. Move `manifestEvidence()`, `lockfileEvidence()`, and `fileExists()` into `paths.ts` (or a new `evidence.ts`).
2. Re-export from `src/adapters/interface.ts` so all adapters get them.
3. Delete the 13 duplicated copies (~10 lines each = ~130 lines removed).

---

## 5. Phase 2 — Medium Risk (Structural Improvements)

### 5.1 Split `service.ts` into focused modules

**Files:** `src/service.ts` (709 LoC)
**Risk:** Medium — well-encapsulated internals, but `analyze()` has a complex control flow
**Estimate:** 4-6 hrs
**Rollback:** The new modules shadow the original class — easy to revert per-module

**Proposed decomposition:**

```
src/service/
├── techstack-engine.ts      # TechStackEngine class (orchestration only, ~150 LoC)
├── inventory-phase.ts       # inventory() — discovery + adapter dispatch
├── enrich-phase.ts          # enrich() — registry + OSV + status classification
├── research-phase.ts        # research() — triage + LLM
├── report-generator.ts      # generateReport() — Markdown + JSON rendering
└── finding-factory.ts       # createFindingForStatus(), computeFingerprint()
```

Each phase module exports a single async function that `TechStackEngine` calls. The `analyze()` method becomes a thin sequence of `await` calls with progress and abort wiring.

**Rationale:**
- 709 lines in one file violates Single Responsibility.
- The report generator and finding factory are pure functions used only by `TechStackEngine` — extracting them makes them independently testable.
- Workflow: `inventory()` → `enrich()` → `research()` is already clean; the split just moves each into its own file.

### 5.2 Harden registry HTTP client

**Files:** `src/registry/client.ts` (530 LoC)
**Risk:** Medium — network code, but HTTP protocol doesn't change
**Estimate:** 3-4 hrs

**Improvements:**

1. **Unify fetch abstraction** — The `httpsFetch()` function and OSV's `osvPostRequest()` are identical in structure. Extract a shared HTTP utility (`src/registry/http-fetch.ts`) with:
   - Retry logic (currently duplicated in `client.ts` and `osv.ts`)
   - AbortSignal handling
   - Timeout
   - JSON response parsing

2. **Add rate-limit header parsing** — `npm registry` returns `Retry-After` header. Currently the backoff is hardcoded.

3. **Reduce cache granularity** — Currently each lookup is cached independently. For batch lookups, the cache is consulted per-package (correct), but `304 Not Modified` extends TTL for each. Consider a batch-cache-invalidation strategy.

4. **Better error classification** — Distinguish between:
   - `RegistryNotFoundError` (404/401 — package doesn't exist)
   - `RegistryNetworkError` (timeout, DNS — transient)
   - `RegistryAuthError` (403 — permissions)
   - `RegistryRateLimitError` (429 — backoff)

### 5.3 Make native audit tests hermetic

**Files:** `tests/advisory/native-audit.test.ts`, `src/advisory/native-audit.ts`
**Risk:** Low-medium — test environment may not have all audit tools installed
**Estimate:** 2 hrs

- Currently `isNativeAuditAvailable()` actually spawns subprocesses.
- **Action:** Make `runAuditCommand()` injectable (strategy pattern or vi.mock the `child_process` module).
- Add a `createAuditRunner()` factory that returns a configured dispatch function, so tests can pass a mock runner.
- The `runNpmAudit`/`runCargoAudit` etc. individual functions should be unit-testable with fixture JSON files instead of real subprocess calls.

---

## 6. Phase 3 — High Risk / High Reward (Architectural)

### 6.1 Replace inline format parsers with a validation grammar

**Files:** All adapter files with hand-rolled parsers (npm, python, rust, dart, dotnet, php, maven, ruby, elixir, cpp)
**Risk:** High — parser replacement can change inventory output
**Estimate:** 2-3 weeks (spread across ecosystem experts)
**Rollback:** Each adapter can be independently rolled back

**Current state:** 10 files with hand-rolled line-based parsers:
- TOML parsers: `python.ts`, `rust.ts`, `dart.ts`
- YAML parsers: `dart.ts` (pubspec.lock)
- XML parsers: `dotnet.ts`, `maven.ts`
- Line-based: `npm.ts` (pnpm lockfile), `go.ts` (go.mod), `ruby.ts` (Gemfile.lock), `elixir.ts` (mix.lock)

**Option A (recommended):** Introduce a shared lightweight parsing utility module `src/adapters/parse-utils.ts` that:
- Provides well-tested TOML, YAML, and XML mini-parsers *only for the subset of each format that appears in dependency files*
- Is explicitly NOT a general-purpose parser (document the limitations)
- Is exhaustively tested against real-world files from the npm registry, crates.io, PyPI, etc.

**Option B (deferred):** Adopt an actual parsing library when one of the formats becomes a maintenance burden. Current hand-rolled parsers are ~3,000 lines total — small enough to maintain but large enough to hurt.

**Recommended path:** Start with Option A for the highest-value targets: pnpm lockfile (most complex), pyproject.toml (most fragile), and pubspec.yaml (YAML is notoriously ambiguous). Then evaluate if the investment pays off for the remaining parsers.

### 6.2 Add dedicated Gradle and Swift adapters

**Files:** `src/adapters/maven.ts` (currently handles both Maven and Gradle), `src/adapters/` (new)
**Risk:** Medium — new code, no existing users for Swift
**Estimate:** 3-4 days total (2 days Gradle, 1-2 days Swift)

**Gradle:**
- Currently `service.ts:98` reuses `mavenAdapter` for `gradle` ecosystem.
- Gradle has a richer dependency model (version catalogs in `libs.versions.toml`, Kotlin DSL `build.gradle.kts`, platform plugins).
- A dedicated `gradle.ts` should parse `build.gradle`/`build.gradle.kts` for `implementation`, `api`, `testImplementation` configurations.
- For lockfile: `gradle.lockfile` (generated by `--write-locks` or Gradle Enterprise).
- **PURL type** is the same `maven` — cross-reuse the PURL logic from `purl.ts`.

**Swift:**
- Currently mapped to ecosystem `swift` with no adapter (`service.ts:100` returns undefined).
- Swift has `Package.swift` (manifest) and `Package.resolved` (lockfile).
- Implement a minimal Tier C adapter like `cpp.ts`: parse `Package.swift` for `.package(url: ...)` entries, parse `Package.resolved` for `version`/`revision`.
- **PURL type:** `swift`.

### 6.3 Go adapter: handle pseudo-versions properly

**Files:** `src/adapters/go.ts`
**Risk:** Medium — changes version resolution for Go modules
**Estimate:** 4 hrs

**Current behavior (`go.ts:123-126`):**
```typescript
// Skip pseudo-versions like v0.0.0-20240701012345-abcdef
versions.set(modulePath, version);
```

The comment says "skip" but the code does the opposite — it sets the version. This is either a bug (the comment is wrong) or intentional (the pseudo-version IS the locked version).

**Action:** Clarify intent:
- If skipping is desired: change to `if (!isPseudoVersion(version)) versions.set(...)` with an explicit `isPseudoVersion` function that checks the `vX.Y.Z-YYYYMMDDHHMMSS-abcdefabcdef` pattern.
- If keeping pseudo-versions: fix the misleading comment.
- In either case: add a test that exercises a `go.sum` with pseudo-versions.
- Also: the comment about `cleanGoVersion` stripping leading `v` — Go pseudo-versions always start with `v` and stripping it is correct, but note that `v0.0.0` becomes `0.0.0` which is fine for comparison.

---

## 7. Phase 4 — Stretch Goals & Ecosystem Expansion

### 7.1 Add transitive dependency inventory

**Baseline:** All adapters inventoried `direct: true` only. `npm.ts` had a comment `// (Phase 1 enhancement: includeTransitive option)`.

**Implemented:** `InventoryOptions.includeTransitive` now inventories lockfile
transitives for npm, Rust, and Python; Gradle and Swift inventory also preserve
direct/transitive provenance where their lock formats expose it.

**Scope:**
- For npm: parse the full lockfile dependency tree (not just the current workspace's importers).
- For Rust: parse `Cargo.lock` `[[package]]` entries beyond direct deps.
- For Python: parse `pip freeze` output or full `poetry.lock`.
- For Go: `go.sum` already lists transitive deps by nature.

**Design:**
- Add `InventoryOptions.includeTransitive` (already in the interface).
- The `includeTransitive` flag triggers a second pass that walks the lockfile dependency graph.
- Each transitive dep records `direct: false` and `scope: 'transitive'`.

### 7.2 Add `npm audit` fixer integration

**Implemented:** `applyPlan()` remains dry-run by default, converts approved
items into structured `language_package` inputs, and executes only through the
normal permission-governed tool runner. CLI supports `/techstack --plan` and
`/techstack --apply`; WebUI requires exact per-item selection and then shows the
standard permission confirmation before any mutation.

**Scope:**
- Add a `applyPlan()` function that executes a plan through permission-gated tool calls.
- Each command runs through `language_package` (the safe alternative to direct `npm install`).
- Dry-run mode still produces the plan; a `--apply` flag would execute user-approved items.

### 7.3 Cross-snapshot trend analysis

**Implemented:** `TrendStore` aggregates persisted snapshots and computes
dependency age, upgrade velocity, and vulnerability half-life. The report is
available through `GET /api/techstack/trends` and the WebUI Trends tab.

**Scope:**
- Add a `TrendStore` that aggregates snapshots over time.
- Track: dependency age (time since locked version), upgrade velocity, vulnerability half-life.
- Expose as a new endpoint or report section.

---

## 8. Rollback Strategy

| Phase | Rollback Mechanism | Impact |
|---|---|---|
| **P1: triage fix** | Undo single-file edit | None |
| **P1: discovery consolidation** | Restore `index.ts` from git | None |
| **P1: parser fuzz tests** | Remove test file | None (additive) |
| **P1: evidence dedup** | Revert `paths.ts` + revert adapter files | All adapters lose shared helpers but keep working with duplicated code |
| **P2: service.ts split** | Restore original `service.ts` from git | New modules become dead code, no functional impact |
| **P2: HTTP client hardening** | Revert to original `client.ts` | OSV `osvPostRequest` still duplicated — no regression |
| **P2: audit test hermetic** | Revert test changes | Tests go back to spawning real processes |
| **P3: parser rewrite** | Revert per-adapter file | Each adapter independently revertible |
| **P3: Gradle/Swift adapters** | Delete new files | No impact on existing functionality |
| **P3: Go pseudo-versions** | Revert single file | One-line change + comment fix |

**General rollback principle:** Every phase in this plan is structured as **additive or file-scoped** changes. No global constant or schema changes are required. Rollback is always `git checkout <file>`.

---

## 9. Verification & Success Criteria

### Implementation result (2026-07-21)

- `@wrongstack/techstack` typecheck, full test suite, and production build pass.
- 26 test files / 331 tests pass, including parser edge cases, Gradle/Swift,
  transitive inventory, HTTP retry policy, native-audit injection, remediation,
  trend analysis, and the 500-package pnpm stress case.
- `triage.ts` contains zero NUL bytes; shared adapter evidence helpers have no
  remaining duplicate implementations; `service.ts` is a compatibility barrel.
- Permission-governed remediation is covered at core, CLI, package-tool, and
  HTTP-handler boundaries; trends and remediation are exposed in WebUI.

### For every phase

- [x] `pnpm --filter @wrongstack/techstack typecheck` passes
- [x] `pnpm --filter @wrongstack/techstack test` passes
- [x] No new `as any` or `!` non-null assertions introduced
- [x] All existing `snapshot-diff-sbom.test.ts`, `remediation.test.ts` etc. remain green

### Phase-specific criteria

| Phase | Criteria |
|---|---|
| **P1 triage** | `triage.ts` is readable, exports match barrel, tests pass |
| **P1 discovery** | `discoverWorkspaces` resolves to `workspace.ts`; `index.ts` has no dead code |
| **P1 fuzz tests** | New test file covers ≥6 parser edge-case categories; existing adapter tests still pass |
| **P1 evidence dedup** | All 13 adapters import evidence helpers from `interface.ts`; no duplicate functions remain |
| **P2 service split** | `TechStackEngine.analyze()` produces identical snapshots for same input (before/after diff on mock inventory) |
| **P2 HTTP hardening** | `client.ts` and `osv.ts` share a single retry/fetch implementation; all registry tests pass |
| **P2 audit hermetic** | Native audit tests pass without any actual audit tool installed; use fixture JSON files |
| **P3 Gradle adapter** | Gradle lockfile fixtures inventory correctly; Maven adapter unchanged |
| **P3 Swift adapter** | Swift Package.resolved parses correctly |

### Stress/load criteria

- [x] Registry client handles 429 responses gracefully (tested with a mock server returning 429).
- [x] Native audit uses async `execFile` with a 60s timeout and injectable command runner.
- [x] pnpm lockfile with 500+ packages parses within 1s.

---

## 10. Appendix: Module Risk Matrix

> Historical audit baseline used to prioritize the work; statuses below are
> pre-implementation and are superseded by the checked results in section 9.

```
Module                LoC   Status    Coverage*  Cost/Change  Priority
──────                ───   ──────    ────────   ───────────  ────────
triage.ts             ?     BROKEN    none       very low     P1-CRITICAL
discovery/index.ts    123   STUB      none       very low     P1-LOW
adapters/*parser      3000  LIVE      60-80%     low          P1-MED
paths.ts              46    LIVE      80%+       very low     P1-LOW
service.ts            709   LIVE      40-60%     medium       P2-HIGH
client.ts             530   LIVE      40-60%     medium       P2-MED
native-audit.ts       499   LIVE      <40%       low          P2-LOW
advisory/osv.ts       274   LIVE      50-70%     low          P2-LOW
research/*            600   LIVE      60-80%     low          P2-LOW
status.ts             306   LIVE      80%+       very low     P2-LOW
sqlite.ts             300   LIVE      40-60%     low          P2-LOW
snapshot-diff.ts       78   LIVE      80%+       very low     P2-LOW
sbom.ts                93   LIVE      80%+       very low     P2-LOW
remediation.ts        207   LIVE      60-80%     low          P2-LOW
delivery/*            137   LIVE      40-60%     low          P2-LOW
purl.ts               326   LIVE      80%+       low          P3-LOW
go adapter (pseudo)   244   LIVE      60-80%     low          P3-MED
gradle adapter         0    MISSING   n/a        medium       P3-LOW
swift adapter          0    MISSING   n/a        low          P4-LOW
transitive deps        —    MISSING   n/a        high         P4-MED

*Coverage estimated from presence of dedicated test files + manual inspection.
```

### Key

| Icon | Meaning |
|---|---|
| **P1-CRITICAL** | Must fix before any other work (blocks code understanding) |
| **P1-LOW** | Quick win, low risk, do anytime |
| **P2-HIGH** | High value, moderate risk, do after P1 |
| **P2-MED/LOW** | Good improvement, independent |
| **P3-MED/LOW** | Important but requires deliberation |
| **P4** | Nice-to-have, defer to roadmap |

---

## Summary of Effort

| Phase | Estimated Effort | Risk | Value |
|---|---|---|---|
| P1 — Quick Wins | 2-3 days | Low | High |
| P2 — Structural | 5-7 days | Medium | High |
| P3 — Architectural | 2-3 weeks | High | Medium-High |
| P4 — Stretch | 1-2 weeks | Medium | Medium |

**Total estimated: 4-7 weeks** depending on parallelization (P1 and P2 can overlap).

**Recommended order of execution:** P1.1 → P1.4 → P1.2 → P1.3 → P2.1 → P2.2 → P2.3 → P3.1 (selective: pnpm + TOML only) → P3.2 → P3.3 → P4 items as time permits.
