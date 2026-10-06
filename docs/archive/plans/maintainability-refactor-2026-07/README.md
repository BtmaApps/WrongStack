# WrongStack Maintainability Refactor Execution Playbook

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


**Date:** 2026-07-21<br>
**Status:** In-repository execution complete; external next-major compatibility removal remains release-gated
**Language:** English<br>
**Scope:** The production monorepo, beginning with Core and continuing through every package and application surface except `website/`

**Scope decision (2026-07-21):** Website implementation work is explicitly excluded. Website measurements remain in the audit baseline as point-in-time repository evidence, but no refactor task in this playbook may modify `website/` unless scope is reopened by a later reviewed decision.

## Purpose

This directory turns the July 2026 maintainability audit into an executable refactor program. It focuses on the conditions that make the system expensive to change:

- more than one authority for the same behavior or metadata;
- feature implementations accumulated inside `@wrongstack/core`;
- compatibility shims that have become permanent architecture;
- runtime and type dependency cycles hidden by barrels or incomplete checks;
- large composition files that also own domain behavior;
- package boundaries bypassed through source aliases, casts, local mirrors, or duck typing;
- manually synchronized registries and user-interface projections.

This is not a rewrite plan and it is not a second status registry. The canonical task status and dependency graph remains:

- [`../architecture-refactor-task-graph-2026-07.md`](../architecture-refactor-task-graph-2026-07.md)
- [`../adr-003-authority-first-refactor-program.md`](../../../plans/adr-003-authority-first-refactor-program.md)

When this playbook and the canonical graph disagree, the accepted ADR and canonical graph win. This playbook must then be corrected in the same change that discovers the discrepancy.

## Document map

| Document | Purpose |
|---|---|
| [`00-audit-baseline.md`](00-audit-baseline.md) | Point-in-time measurements, verified failure modes, and risk ranking |
| [`01-target-architecture.md`](01-target-architecture.md) | Intended package ownership, dependency direction, and public-contract rules |
| [`02-execution-roadmap.md`](02-execution-roadmap.md) | Dependency-aware waves, sequencing, PR sizing, and program milestones |
| [`03-core-runtime-memory.md`](03-core-runtime-memory.md) | Detailed plan for Core, Runtime, storage, coordination, Kanban, and memory |
| [`04-surfaces-and-hosts.md`](04-surfaces-and-hosts.md) | Detailed plan for CLI, TUI, WebUI, WebUI Server, HQ, SimpleUI, Desktop, and app wrappers |
| [`05-platform-and-extensions.md`](05-platform-and-extensions.md) | Detailed plan for providers, plugins, tools, ACP, MCP, SDD, scanner, and the remaining packages |
| [`06-verification-governance.md`](06-verification-governance.md) | CI gates, architecture checks, exception policy, migration protocol, and metrics |
| [`07-task-crosswalk.md`](07-task-crosswalk.md) | Mapping between audit findings, this playbook, and canonical graph task IDs |
| [`08-test-type-debt-burndown.md`](08-test-type-debt-burndown.md) | Package-ordered plan for eliminating the test-inclusive TypeScript baseline |
| [`09-runtime-pilot-decision.md`](09-runtime-pilot-decision.md) | Runtime pilot evidence, kill criteria, and the accepted facade-fold decision |
| [`10-completion-report.md`](10-completion-report.md) | Final in-repository outcomes, verification evidence, and release-gated residuals |

## Program outcome

The refactor is complete only when all of the following are true:

1. Each cross-surface behavior and metadata family has exactly one canonical authority.
2. `@wrongstack/core` contains contracts and true agent-domain primitives, not host, UI, installer, or product-plugin implementations.
3. Runtime composition has one documented owner and no unsafe compatibility casts.
4. Every compatibility adapter has an owner, expiry, usage scan, and removal gate.
5. Runtime and type-level module cycles are detected in CI.
6. CLI, TUI, and browser applications are composition or presentation shells rather than domain-service containers.
7. The embedded CLI WebUI backend has been retired in favor of `@wrongstack/webui-server`.
8. Provider, plugin, tool, and surface protocol projections are generated from typed authorities.
9. Large-file reductions correspond to reduced coupling and responsibility, not merely more forwarding files.
10. Clean-checkout build, typecheck, test, package, and release verification is deterministic.

## Non-goals

- Rewriting the product from scratch.
- Extracting a package solely to reduce a line-count metric.
- Sharing renderer-specific focus, layout, animation, or selection state across UI implementations.
- Removing public compatibility exports in the same PR that introduces replacements.
- Moving HTTP, WebSocket, plugin-installation, or provider-specific behavior into Core.
- Freezing feature development for the duration of the program.
- Refactoring or regenerating the Website; `website/` is outside the implementation scope.

## How to execute a work item

Every implementation slice follows the same sequence:

1. Re-read the canonical task status and current tree.
2. Identify old authority, new authority, consumers, and compatibility route.
3. Add characterization tests before moving behavior.
4. Introduce the new contract or owner additively.
5. Migrate one consumer or handler family.
6. Prove behavioral parity and dependency direction.
7. Keep rollback possible until the migration gate passes.
8. Remove the old path only after a repository-wide usage scan and the stated deprecation period.
9. Update the canonical task graph and architecture health evidence in the same PR.

## PR boundaries

A normal PR should change one behavioral seam and remain independently reversible. Package creation, mass import migration, behavioral migration, and compatibility removal are separate PRs unless the changed surface is both private and fully characterized.

Avoid PRs whose primary result is moving thousands of lines without changing ownership. A valid slice should make at least one of these statements true:

- one former authority no longer decides behavior;
- one dependency edge has been removed or reversed;
- one consumer now depends on a neutral contract instead of an implementation;
- one compatibility branch has a measured removal path;
- one composition root has stopped owning domain behavior.

## First implementation decision

Start with verification and authority contracts, not hotspot splitting. The first implementation batch should be:

1. architecture inventory and complete boundary checks;
2. module-cycle detection including type dependencies;
3. temporary-exception registry with owner and expiry;
4. neutral surface-protocol package design;
5. `MemoryPort`, `ProviderDefinition`, and `PluginManifest` contract designs.

These steps make later movement measurable and prevent a large file from being replaced by a distributed form of the same coupling.
