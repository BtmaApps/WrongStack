# TechStack — Software Design Document (SDD)

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


**Spec ID:** `techstack-v1`
**Created:** 2026-07-16
**Status:** Draft (research complete, pending implementation approval)
**Template:** SDD feature
**Owner:** Maintainers + WebUI/CLI/Tools contributors

---

## 1. Overview

### Problem

When WrongStack is connected to a target project (`workdir`), the user has no visibility into that project's dependency landscape — what's installed, what's outdated, what's vulnerable, and what action is recommended. The existing `/techstack` slash command is npm-only, runs an LLM ad-hoc, writes a static report file into the source tree, and has no persistent state, no WebUI surface, and no safe idle-delivery path.

### Solution

A new **TechStack** feature that:

1. **Discovers** all workspaces, manifests, and lockfiles in the active `workdir` across all supported ecosystems — deterministic, not LLM-driven.
2. **Inventories** every direct and transitive dependency with its ecosystem-native resolved version, constraint, and source type.
3. **Enriches** the inventory with registry metadata (latest stable, license, deprecation, yanked status) and security advisories (native audit + OSV batch).
4. **Analyzes** ambiguous findings using targeted research agents (breaking-change assessment, migration guidance, replacement recommendations) — only where deterministic data is insufficient.
5. **Displays** all findings on a dedicated lazy-loaded WebUI page (`TechStackView`) with workspace grouping, status filters, evidence drawers, and export.
6. **Delivers** a concise report summary to the active chat session when it becomes idle, via a durable per-session outbox — never mid-run, never duplicated, crash-safe.
7. **Supports** optional on-demand remediation planning (dry-run upgrade plans) using existing `language_package` tooling, gated by the normal permission/autonomy system.

### Core design principle

> **Deterministic engines for facts; agents for interpretation.** The inventory, version comparison, and advisory matching are deterministic. Agents never discover packages ad hoc or fabricate version numbers. They only research contextual questions: "Is this major upgrade breaking?", "What's the recommended replacement?", "Is this CVE applicable to our usage?"

### Scope boundary

The feature analyzes the **active target project connected to WrongStack** — the `workdir` / `projectRoot` from the server runtime state. It does **not** analyze WrongStack's own dependency stack, except when inspecting WrongStack source code as integration evidence.

---

## 2. Requirements

### Critical

```
[critical] R1  Discover all supported workspaces in the active workdir using detectLanguageWorkspaces()
[critical] R2  Inventory all direct and transitive dependencies per workspace, including source type (registry/path/git/system)
[critical] R3  Normalize every dependency to a Package URL (PURL) identifier
[critical] R4  Persist job, snapshot, and report state in a durable SQLite store under the project data directory
[critical] R5  Display inventory + findings on a lazy-loaded WebUI TechStackView page
[critical] R6  Never accept a browser-supplied targetRoot; always use the server's active projectRoot
[critical] R7  Distinguish requested/locked/installed/wanted/resolvable/latest version fields, not a single "current"
[critical] R8  Never classify a private/unresolved package (404/401) as "dead" or "deprecated"
[critical] R9  Never classify an offline/failed registry lookup as "current" or "up-to-date"
```

### High

```
[high] R10 Support Tier A ecosystems with full deterministic inventory + registry + advisory: npm/pnpm/yarn/bun, Python, Rust, Go, .NET, PHP, Dart
[high] R11 Support OSV /v1/querybatch for cross-ecosystem vulnerability enrichment
[high] R12 Support ecosystem-native audit commands (npm audit, pip-audit, cargo-audit, govulncheck, composer audit, dotnet package audit)
[high] R13 Run analyze jobs as persistent async tasks with progress streaming via WebSocket events
[high] R14 Deliver report summaries to the chat only when the session is idle, via a durable outbox with exactly-once visible delivery
[high] R15 Offline mode: show last cached snapshot with "stale/offline" status indicators
[high] R16 Coverage ledger: mark each workspace as full/partial/unsupported coverage
```

### Medium

```
[medium] R17 Support Tier B ecosystems with partial deterministic support: Maven, Gradle, Ruby/Bundler, Swift, Elixir/Hex
[medium] R18 Snapshot fingerprint (manifest+lockfile+adapter-version hash) to skip redundant re-analysis
[medium] R19 Registry metadata caching with ETag/TTL and per-host concurrency limits
[medium] R20 Export snapshot/report as Markdown and JSON
[medium] R21 Snapshot diff (compare two snapshots to show what changed)
```

### Low

```
[low] R22  SBOM export (SPDX, CycloneDX)
[low] R23  Manifest/lockfile watcher with debounced auto-refresh
[low] R24  Tier C best-effort adapters: C/C++ (Conan/vcpkg), custom build systems
[low] R25  Remediation planning: dry-run upgrade plan with manifest/lockfile diff preview
```

---

## 3. Architecture

### 3.1 Layer diagram

```
┌──────────────────────────────────────────────────────┐
│                   WebUI (browser)                     │
│                                                       │
│  TechStackView (lazy, full-screen MainView)           │
│    ├─ workspace tree                                  │
│    ├─ dependency table (virtualized)                  │
│    ├─ KPI cards + status filters                      │
│    ├─ evidence/finding drawer                         │
│    └─ export buttons                                  │
│                                                       │
│  stores/techstack-store.ts (Zustand)                  │
│    └─ subscribes to techstack.* WS events             │
└───────────────────────┬──────────────────────────────┘
                        │ WS
┌───────────────────────▼──────────────────────────────┐
│              WebUI Server (webui-server)               │
│                                                       │
│  HTTP routes:                                         │
│    GET  /api/techstack/snapshot                       │
│    POST /api/techstack/inventory                      │
│    POST /api/techstack/analyze                        │
│    GET  /api/techstack/jobs/:id                       │
│    POST /api/techstack/jobs/:id/cancel                │
│    GET  /api/techstack/reports/:id                    │
│    POST /api/techstack/reports/:id/deliver            │
│                                                       │
│  WS events:                                           │
│    techstack.job.started / .progress / .failed        │
│    techstack.workspace.completed                      │
│    techstack.snapshot.updated                         │
│    techstack.report.ready / .delivered                │
│                                                       │
│  DeliveryCoordinator (per-session mutex + outbox)     │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│              TechStack Engine (new package)            │
│         packages/techstack/src/                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Discovery (reuses detectLanguageWorkspaces)     │  │
│  └───────────────┬─────────────────────────────────┘  │
│                  │                                     │
│  ┌───────────────▼─────────────────────────────────┐  │
│  │  Inventory (ecosystem adapters)                  │  │
│  │    npm/lockfile parser, Cargo.toml/Cargo.lock    │  │
│  │    go.mod/go.sum, pyproject/requirements, etc.   │  │
│  └───────────────┬─────────────────────────────────┘  │
│                  │                                     │
│  ┌───────────────▼─────────────────────────────────┐  │
│  │  Enrichment (registry + advisory)                │  │
│  │    npm registry API, PyPI JSON, crates.io,       │  │
│  │    Maven Central REST, NuGet V3, pub.dev,        │  │
│  │    OSV /v1/querybatch, native audit adapters     │  │
│  └───────────────┬─────────────────────────────────┘  │
│                  │                                     │
│  ┌───────────────▼─────────────────────────────────┐  │
│  │  Policy + Status Analysis                        │  │
│  │    version comparison, deprecation, yanked,      │  │
│  │    constraint analysis, severity classification  │  │
│  └───────────────┬─────────────────────────────────┘  │
│                  │                                     │
│  ┌───────────────▼─────────────────────────────────┐  │
│  │  Agent Research (optional, on-demand)            │  │
│  │    Director.spawn → research agents              │  │
│  │    changelog, migration, replacement, breaking   │  │
│  └───────────────┬─────────────────────────────────┘  │
│                  │                                     │
│  ┌───────────────▼─────────────────────────────────┐  │
│  │  Report + Store (SQLite)                         │  │
│  │    snapshot, findings, evidence, job, outbox     │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### 3.2 Package placement

New package: `packages/techstack/`

```
packages/techstack/
  src/
    types.ts                 — core domain types (Job, Workspace, DependencyObservation, Finding, Evidence, Snapshot)
    adapters/
      interface.ts           — EcosystemAdapter contract
      npm.ts                 — npm/pnpm/yarn/bun adapter
      python.ts              — pip/poetry/pipenv/uv adapter
      rust.ts                — cargo adapter
      go.ts                  — go module adapter
      dotnet.ts              — NuGet/dotnet adapter
      php.ts                 — composer adapter
      dart.ts                — pub adapter
      maven.ts               — Maven adapter (Tier B)
      gradle.ts              — Gradle adapter (Tier B)
      ruby.ts                — bundler adapter (Tier B)
      swift.ts               — SPM adapter (Tier B)
      elixir.ts              — hex adapter (Tier B)
      cpp.ts                 — Conan/vcpkg adapter (Tier C)
    discovery/
      workspace.ts           — wraps detectLanguageWorkspaces
    inventory/
      engine.ts              — orchestrates adapters across workspaces
    registry/
      client.ts              — per-ecosystem registry HTTP client with cache/backoff
      purl.ts                — PURL construction/parsing
    advisory/
      osv.ts                 — OSV /v1/querybatch client
      native-audit.ts        — ecosystem-native audit command wrappers
    policy/
      status.ts              — version comparison + status classification
    store/
      sqlite.ts              — SQLite-backed snapshot/job/report/outbox store
      schema.ts              — DDL + migrations
    report/
      generator.ts           — snapshot → markdown/JSON report
    delivery/
      coordinator.ts         — idle-delivery outbox + run-settled claim
    service.ts               — public API: createInventoryJob, createAnalyzeJob, getSnapshot, etc.
    index.ts                 — barrel exports
  tests/
    adapters/
    inventory/
    registry/
    advisory/
    policy/
    store/
    fixtures/
      monorepo-pnpm/
      monorepo-python/
      monorepo-mixed/
```

### 3.3 Reuse points

| Existing component | File | Role in TechStack |
|---|---|---|
| `detectLanguageWorkspaces()` | `packages/tools/src/languages/detect.ts` | Workspace discovery engine |
| Language profiles | `packages/tools/src/languages/profiles/*.ts` | Ecosystem metadata + operation support |
| `language_package` tool | `packages/tools/src/languages/package-tool.ts` | Remediation (dry-run upgrade plans) |
| Director spawn/assign | `packages/core/src/coordination/director.ts` | Agent research dispatch |
| WS event bridge | `packages/webui-server/src/server/setup-events.ts` | Stream techstack.* events to browser |
| GlobalMailbox | `packages/core/src/coordination/mailbox.ts` | (Not used for delivery — use outbox) |
| ActivityBar + view-navigation | `packages/webui/src/lib/view-navigation.ts` | Register `'techstack'` as a MainView |
| `node:sqlite` | (Node 22.5+) | Snapshot/job/report/outbox store |

### 3.4 What is explicitly NOT reused

| Existing component | Why not |
|---|---|
| `cli/slash-commands/techstack.ts` | npm-only, LLM-driven, writes to source tree; becomes a compatibility shim calling the new service |
| `techstack-mailbox-consumer.ts` | Non-idempotent (in-memory `processedIds`), read-ack-before-spawn; replaced by the new job/outbox engine |
| `security-scanner/detector.ts` | Root-level only, doesn't extract dependency lists; not reusable for inventory |
| Browser chat queue (localStorage) | Not durable, not cross-surface; delivery uses server-side outbox |
| Mailbox iteration injection | Fires mid-run at every LLM iteration boundary; not safe for idle-only delivery |

---

## 4. Data Contracts

### 4.1 Core types

```typescript
// types.ts

type EcosystemId =
  | 'npm' | 'python' | 'rust' | 'go' | 'dotnet' | 'php' | 'dart'
  | 'maven' | 'gradle' | 'ruby' | 'swift' | 'elixir' | 'cpp';

type SourceType = 'registry' | 'workspace' | 'path' | 'git' | 'system' | 'unknown';

type DependencyScope =
  | 'runtime' | 'development' | 'peer' | 'build' | 'optional' | 'transitive';

type DependencyStatus =
  | 'current'
  | 'update_available_safe'
  | 'update_available_breaking'
  | 'blocked_by_constraints'
  | 'vulnerable'
  | 'deprecated'
  | 'yanked'
  | 'unmaintained_suspected'
  | 'private_or_unresolved'
  | 'local_path'
  | 'git_dependency'
  | 'unsupported'
  | 'unknown';

type Coverage = 'full' | 'partial' | 'unsupported';

interface Workspace {
  id: string;
  relativeRoot: string;
  ecosystem: EcosystemId;
  packageManager?: string;
  manifests: string[];
  lockfiles: string[];
  confidence: number;
  coverage: Coverage;
}

interface DependencyObservation {
  id: string;
  workspaceId: string;
  purl?: string;
  ecosystem: EcosystemId;
  name: string;
  sourceType: SourceType;
  direct: boolean;
  scope: DependencyScope;
  requested?: string;        // constraint from manifest
  locked?: string;           // exact version from lockfile
  installed?: string;        // observed version from environment
  wanted?: string;           // latest within current constraint
  resolvable?: string;       // latest considering all constraints
  latestStable?: string;     // latest stable from registry
  license?: string;
  deprecated?: boolean;
  yanked?: boolean;
  status: DependencyStatus;
  evidence: Evidence[];
}

interface Evidence {
  kind: 'manifest' | 'lockfile' | 'registry' | 'audit' | 'osv' | 'agent' | 'command';
  source: string;             // URL, file path, or command
  retrievedAt: string;        // ISO timestamp
  detail?: string;
}

interface Finding {
  id: string;
  dependencyId: string;
  type: 'upgrade' | 'vulnerability' | 'deprecated' | 'license' | 'replacement' | 'unsupported' | 'investigate';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  action: 'none' | 'upgrade_patch' | 'upgrade_minor' | 'upgrade_major' | 'replace' | 'remove' | 'investigate';
  confidence: number;         // 0..1
  rationale: string;
  breakingRisk?: string;
  evidence: Evidence[];
}

interface Snapshot {
  id: string;
  projectId: string;
  targetRoot: string;
  fingerprint: string;        // hash of manifests + lockfiles + adapter version
  createdAt: string;
  workspaces: Workspace[];
  dependencies: DependencyObservation[];
  findings: Finding[];
  coverage: Coverage;
  adapterVersion: string;
}

interface TechStackJob {
  id: string;
  projectId: string;
  targetRoot: string;
  kind: 'inventory' | 'analyze';
  status: 'queued' | 'discovering' | 'inventorying' | 'enriching'
        | 'researching' | 'synthesizing' | 'completed' | 'failed' | 'cancelled';
  fingerprint: string;
  requestedBy: string;
  sessionId?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  progress?: { phase: string; completed: number; total: number };
}

interface DeliveryOutbox {
  deliveryId: string;
  reportId: string;
  sessionId: string;
  status: 'pending' | 'claimed' | 'delivered' | 'failed';
  attempts: number;
  claimedAt?: string;
  deliveredAt?: string;
}
```

### 4.2 HTTP API

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/api/techstack/snapshot` | — | `{ snapshot: Snapshot, stale: boolean }` |
| POST | `/api/techstack/inventory` | `{ force?: boolean }` | `{ jobId: string }` |
| POST | `/api/techstack/analyze` | `{ sessionId?: string, autoDeliver?: boolean, online?: boolean }` | `{ jobId: string }` |
| GET | `/api/techstack/jobs/:id` | — | `{ job: TechStackJob }` |
| POST | `/api/techstack/jobs/:id/cancel` | — | `{ ok: boolean }` |
| GET | `/api/techstack/reports/:id` | `?format=md\|json` | `Snapshot` or markdown text |
| POST | `/api/techstack/reports/:id/deliver` | `{ sessionId: string }` | `{ deliveryId: string }` |

**Security:** All routes inherit the existing `requireAccessToken` / loopback gate. No `targetRoot` is accepted from the browser — always resolved from server runtime state.

### 4.3 WebSocket events

| Event | Payload |
|---|---|
| `techstack.job.started` | `{ jobId, kind }` |
| `techstack.job.progress` | `{ jobId, phase, completed, total }` |
| `techstack.workspace.completed` | `{ jobId, workspaceId, ecosystem, dependencyCount }` |
| `techstack.snapshot.updated` | `{ snapshotId, fingerprint, dependencyCount, findingCount }` |
| `techstack.report.ready` | `{ reportId, summary }` |
| `techstack.report.delivered` | `{ deliveryId, sessionId }` |
| `techstack.job.failed` | `{ jobId, error }` |

---

## 5. Idle-Delivery Contract

### 5.1 What it must guarantee

1. **Idle-only:** report is never injected mid-run (while `Agent._runInProgress` is true).
2. **Exactly-once visible delivery:** across crash, reconnect, or multiple outbox entries for the same report.
3. **Durable:** survives server restart; pending entries retry on recovery.
4. **Bounded:** at most one delivery per report per session.

### 5.2 How it works

```
analyze completes → full report persisted to SQLite
                   → outbox entry created with stable deliveryId

DeliveryCoordinator (per-session loop):
  1. await run-settled signal (Agent.run() promise resolves + _runInProgress cleared)
  2. acquire per-session mutex (CAS on session journal)
  3. check: is this deliveryId already in the session journal? → skip
  4. append first-class techstack_report message to session journal
  5. broadcast techstack.report.delivered WS event
  6. mark outbox entry delivered
  7. release mutex
```

### 5.3 Missing primitives (to implement)

| Primitive | Why needed |
|---|---|
| Public/awaitable run-settled signal on Agent | `agent.run.completed` fires before `_runInProgress` clears |
| Durable task results | `Director.completed` holds full results only in memory |
| Atomic job claim / idempotency key | Prevents duplicate inventory/analyze on same fingerprint |
| Delivery event with stable id/provenance | Session journal check for exactly-once |
| Generic server-originated chat-message WS event | Currently only user_message handler sends run.result |

### 5.4 What is NOT used

- Browser localStorage chat queue (not durable, not cross-surface)
- Generic mailbox injection (fires mid-run, in-memory dedup, not exactly-once)
- `agent.run.completed` event (fires before `_runInProgress` clears — not a safe idle gate)

---

## 6. Ecosystem Support Matrix

| Ecosystem | Tier | Inventory | Registry | Advisory | Notes |
|---|---|---|---|---|---|
| npm/pnpm/yarn/bun | A | lockfile parse + `ls` | npm registry API | npm audit + OSV | Full support |
| Python | A | pyproject/requirements/Pipfile + `pip inspect` | PyPI JSON API | pip-audit + OSV | Full support |
| Rust | A | Cargo.toml + Cargo.lock + `cargo metadata` | crates.io API | cargo-audit + OSV | Full support |
| Go | A | go.mod + go.sum + `go list -m -json all` | proxy.golang.org | govulncheck + OSV | Full support |
| .NET | A | csproj + project.assets.json | NuGet V3 API | `dotnet package audit` + OSV | Full support |
| PHP | A | composer.json + composer.lock | Packagist API | `composer audit` + OSV | Full support |
| Dart | A | pubspec.yaml + pubspec.lock | pub.dev API | pub advisory + OSV | Full support |
| Maven | B | pom.xml + `mvn dependency:tree` | Maven Central REST | OSV | Partial: dependency management complexity |
| Gradle | B | build.gradle + `gradle dependencies` | Maven Central REST | OSV | Partial: build script execution risk |
| Ruby | B | Gemfile + Gemfile.lock | RubyGems API | bundler-audit + OSV | Partial |
| Swift | B | Package.resolved + `swift package show-dependencies` | — | OSV | Partial: no public registry metadata API |
| Elixir | B | mix.exs + mix.lock | hex.pm API | OSV | Partial |
| C/C++ | C | Conan/vcpkg manifests | — | OSV | Best-effort: no universal manifest standard |

---

## 7. Security Considerations

| Risk | Mitigation |
|---|---|
| Private registry token leakage | Credentials scrubbed from all logs/reports; host-aware cache; tokens never persisted in snapshot |
| Registry fan-out cost | Batch queries, ETag/TTL cache, per-host concurrency limit, exponential backoff on 429/5xx |
| LLM fabricating version numbers | `latestStable` comes only from registry evidence; agent findings never set version fields |
| Package manager executing project code | Inventory parses files first; commands that execute code require explicit permission |
| Monorepo false dedup | Workspace identity preserved; PURL used only for aggregate cross-workspace view |
| Lockfile mutation during scan | Inventory/analyze is read-only; updates are a separate remediation flow |
| Chat transcript inflation | Only summary + top findings + report link delivered to chat; full report stays on TechStackView |
| Double delivery | Durable deliveryId + session journal check + outbox CAS |
| Unsupported manifest misclassified as "all current" | Coverage ledger marks workspace as partial/unsupported; unknown manifests are listed, not hidden |

---

## 8. Testing Strategy

### 8.1 Unit tests (per adapter)

- Manifest parsing → correct `DependencyObservation[]`
- Lockfile parsing → correct `locked` versions
- PURL construction → valid PURL for each ecosystem
- Status classification → correct `DependencyStatus` for version gap scenarios

### 8.2 Integration tests (fixture monorepos)

Create test fixtures under `packages/techstack/tests/fixtures/`:
- `monorepo-pnpm/` — pnpm workspace with multiple packages
- `monorepo-python/` — pyproject.toml + requirements.txt
- `monorepo-mixed/` — JS + Python + Rust in one tree

Assert: same fixture produces same normalized inventory on all platforms.

### 8.3 Policy tests

- Version comparison edge cases (prerelease, build metadata, semver ranges)
- Status classification matrix (current / update_safe / update_breaking / blocked / vulnerable / deprecated)
- Private package 404 → `private_or_unresolved`, not `dead`

### 8.4 Delivery tests

- Outbox survives store close/reopen
- Delivery only after run-settled
- Exactly-once across crash simulation
- Duplicate outbox entries → single visible delivery

### 8.5 HTTP API tests

- No `targetRoot` accepted from browser
- 401 on unauthenticated non-loopback
- 503 on missing store / corrupted SQLite
- Job cancel is idempotent

---

## 9. Rollout Plan

| Phase | Scope | Deliverable |
|---|---|---|
| 0 | Types, adapter interface, PURL mapping, test fixtures | Contract + fixture suite green |
| 1 | Offline inventory + SQLite store + read-only WebUI page | Network-free inventory visible |
| 2 | Registry enrichment + OSV advisory + evidence drawer | Version/advisory findings with evidence |
| 3 | Analyze job + agent research + progress WS events | Persistent async analysis |
| 4 | Idle-delivery outbox + run-settled coordinator | Crash-safe exactly-once chat delivery |
| 5 | Remediation planning (dry-run upgrade preview) | On-demand upgrade plan |
| 6 | Watch mode + Tier B/C adapters + SBOM export | Continuous monitoring + ecosystem breadth |

---

## 10. Acceptance Criteria

1. Opening the TechStack page shows the active project's dependency inventory without requiring an online analyze run.
2. Every dependency row has at least one `Evidence` entry backing its status; no status is asserted without evidence.
3. An `analyze` run persists a `Snapshot` that survives a server restart.
4. A report summary appears in the chat only after the agent run completes, never mid-run, and appears exactly once across reconnects.
5. A private registry package (404) is shown as `private_or_unresolved`, never `dead` or `deprecated`.
6. Offline mode shows the last cached snapshot with visible "stale/offline" indicators.
7. The browser never sends `targetRoot`; the server always resolves it from its own runtime state.
8. Export produces valid Markdown and JSON representing the full snapshot.
9. `tsc --noEmit` passes on `@wrongstack/techstack`, `@wrongstack/webui`, and `@wrongstack/webui-server`.
10. `vitest` passes on the techstack package including adapter, policy, store, and delivery tests.

---

## 11. Open Questions

1. **Package name:** `@wrongstack/techstack` (new package) vs. `packages/tools/src/techstack/` (inside tools)? — Recommend new package; feature is substantial enough.
2. **Adapter registration:** Manual import in `adapters/index.ts` vs. auto-discovery? — Recommend manual for determinism.
3. **OSV rate-limit strategy:** OSV currently has no documented rate limit, but a per-batch chunk size (e.g., 500 packages) should be enforced defensively.
4. **Delivery to TUI/REPL:** The outbox is server-side, but TUI uses a session-sidecar queue. Should the delivery coordinator write to both? — Recommend server journal as single source, with TUI polling the same store.
5. **Agent research scope:** One agent per ecosystem cluster vs. one per finding-type cluster? — Recommend finding-type clusters (breaking-change expert, replacement expert, CVE-applicability expert) to reduce agent count.
