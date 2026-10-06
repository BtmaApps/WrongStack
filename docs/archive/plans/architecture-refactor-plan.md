# Architecture Refactor Plan

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


> **Superseded for execution sequencing (2026-07-15).** This document remains historical analysis. The accepted decision and canonical live dependency/status registry are:
> - [`adr-003-authority-first-refactor-program.md`](../../plans/adr-003-authority-first-refactor-program.md)
> - [`architecture-refactor-task-graph-2026-07.md`](architecture-refactor-task-graph-2026-07.md)
>
> Do not start work from the phase or PR order below without mapping it to an active task in the canonical graph.

## Status

- **Status:** Draft
- **Type:** Planning document
- **Scope:** Monorepo-wide structural refactor planning
- **Last updated:** 2026-07-03

---

## Purpose

This document records the current architecture refactor plan derived from a read-only review of the WrongStack monorepo.

Its purpose is to:

- identify the highest-value structural cleanup work,
- sequence that work into reviewable PR-sized units,
- preserve runtime behavior while improving ownership and dependency direction,
- and provide a stable roadmap for subsequent decomposition work.

This document is planning-only. It does not imply that any of the changes described here have already been implemented.

---

## Related

This plan is related to:

- workspace package boundaries under `packages/*` and `apps/*`,
- `ARCHITECTURE.md`,
- core architecture tests under `packages/core/tests/architecture/`,
- CLI orchestration under `packages/cli/src/`,
- TUI and WebUI composition under `packages/tui/src/` and `packages/webui/src/`,
- package manifests and public export surfaces,
- and supporting test/configuration surfaces such as Vitest and Biome.

Where follow-up PRs touch these areas, this plan should be used as sequencing guidance rather than as a substitute for PR-specific implementation details.

---

## Scope

This plan covers:

- core export-surface cleanup,
- CLI orchestration and command-boundary cleanup,
- TUI and WebUI shell decomposition,
- selected package-ownership corrections,
- and supporting test/configuration guardrails.

This plan does not serve as an implementation log. Individual PRs should carry exact file lists, acceptance criteria, and validation commands for their own scope.

---

## Out of scope

This plan does **not** attempt to:

- redesign product behavior,
- combine structural cleanup with feature development,
- remove every compatibility layer in a single pass,
- rewrite large domains opportunistically without prior guardrails,
- or prescribe exact code movement beyond the level needed for safe sequencing.

Large refactors should remain incremental, reviewable, and behavior-preserving unless a PR is explicitly scoped as a bug fix or behavior change.

---

## Summary of findings

### Core architecture

The review identified several issues in `@wrongstack/core`:

- `packages/core/src/types/index.ts` is not currently a true leaf export surface and re-exports concrete implementation modules from sibling domains.
- `packages/core/src/defaults/index.ts` acts as a large compatibility barrel with substantial overlap across domain-owned exports.
- `packages/core/src/coordination/` has grown into a broad catch-all area.
- mailbox factory responsibilities currently live in `packages/core/src/hq/factory.ts`, although they belong more naturally to the coordination layer.

### CLI architecture

The review identified structural issues in the CLI layer:

- `packages/cli/src/cli-main.ts` is oversized and mixes multiple concerns.
- `packages/cli/src/slash-commands/` currently hosts both command-layer logic and shared runtime helpers.
- multiple slash command files are large enough to justify later decomposition work.

### UI architecture

The review identified large coordination and rendering shells in the UI layers:

- `packages/tui/src/app.tsx` is a significant monolith.
- several WebUI components are oversized and should be split by concern.
- desktop-shell bridge behavior is embedded directly in `packages/webui/src/App.tsx`.

### Workspace/package structure

Additional findings include:

- `@wrongstack/skills` currently behaves as a placeholder rather than a real package.
- `webui-hq` has drifted from the main frontend toolchain baseline.

### Testing/configuration

The review also found supporting cleanup opportunities:

- CLI Vitest aliases `@wrongstack/core` to source, but needed similar handling for `@wrongstack/tools`.
- architecture guardrails are needed to prevent hotspot files and CLI boundary debt from growing further.

---

## Objectives

The refactor program has four primary objectives:

1. **Restore architectural ownership boundaries**
   - reduce cases where modules export or host concerns they do not logically own.

2. **Reduce overlapping export surfaces**
   - especially across `@wrongstack/core`, `@wrongstack/core/defaults`, and `@wrongstack/core/types`.

3. **Decompose oversized orchestration and UI modules**
   - so large files act as coordinators rather than mixed-concern containers.

4. **Introduce guardrails before major refactors**
   - to prevent additional structural drift while decomposition work is in progress.

---

## Sequencing

### Phase 0 — Guardrails

These changes should land before major refactors begin.

1. Add architecture guardrails for hotspot files and slash-command boundary violations.
2. Fix CLI Vitest source alias drift for `@wrongstack/tools`.

### Phase 1 — Small, high-value cleanup

These are low-risk cleanup items that improve the base architecture before large moves.

3. Deduplicate `detectEcosystem`.
4. Remove dead `@wrongstack/core` subpath exports.
5. Resolve the future of `@wrongstack/skills` (remove or convert into a real package).

### Phase 2 — Core architecture cleanup

These changes address the highest-leverage architectural issues in `@wrongstack/core`.

6. Make `@wrongstack/core/types` a true leaf export surface.
7. Move mailbox factory logic out of `hq/factory.ts` and into the coordination layer.
8. Shrink and de-emphasize `@wrongstack/core/defaults`.
9. Split `coordination/` into clearer subdomains.

### Phase 3 — CLI boundary cleanup

These changes restore service/command ownership boundaries and prepare for later decomposition.

10. Extract shared services out of `packages/cli/src/slash-commands/`.
11. Split `packages/cli/src/cli-main.ts` into focused orchestration modules.
12. Decompose the largest slash-command modules in later follow-up PRs.

### Phase 4 — TUI and WebUI decomposition

These changes address large UI orchestration and rendering shells.

13. Decompose `packages/tui/src/app.tsx`.
14. Split large WebUI components and extract desktop bridge logic from `App.tsx`.

### Phase 5 — Tools/plugins cleanup

These changes improve ownership boundaries in secondary packages.

15. Move process infrastructure out of `@wrongstack/tools` if ownership analysis confirms it belongs elsewhere.
16. Separate internal indexing-host concerns from user-facing tools.
17. Replace eager plugin catalog construction with a metadata-driven approach.

### Phase 6 — Documentation and consistency

These changes align the codebase with its published/project-facing surfaces.

18. Consolidate tool/plugin/site metadata into a canonical source.
19. Align `webui-hq` toolchain versions with the main frontend baseline.
20. Strengthen structural test coverage in `desktop` and `webui-hq`.

---

## Initial PR roadmap

The following PRs form the initial implementation roadmap.

### PR-A1 — Architecture guardrails
Add tests that:
- cap the growth of known hotspot files,
- and prevent new non-command imports from `packages/cli/src/slash-commands/`.

### PR-A2 — CLI Vitest alias cleanup
Resolve `@wrongstack/tools` from source in CLI Vitest runs.

### PR-B1 — `detectEcosystem` deduplication
Remove the drifted duplicate implementation in core coordination.

### PR-B2 — Dead core subpath export cleanup
Remove unused `@wrongstack/core` subpath exports.

### PR-B3 — `@wrongstack/skills` resolution
Remove the placeholder package or convert it into a real source package.

### PR-C1 — `@wrongstack/core/types` leaf cleanup
Stop `types/` from re-exporting concrete sibling implementations and migrate consumers to the correct owning domains.

### PR-C2 — Mailbox factory ownership cleanup
Move mailbox/global-mailbox factory responsibilities from `hq/factory.ts` into the coordination layer.

### PR-C3 — `core/defaults` reduction
Shrink `packages/core/src/defaults/index.ts` and reframe it as a compatibility-oriented barrel.

### PR-D1 — Slash-command service extraction
Move shared runtime logic out of `packages/cli/src/slash-commands/` into a dedicated service layer.

### PR-D2 — `cli-main.ts` split
Extract orchestration concerns out of `cli-main.ts` so the file becomes a top-level coordinator rather than a mixed-concern container.

---

## High-priority target files

The following files should be treated as the highest-value structural targets.

### Core
- `packages/core/src/types/index.ts`
- `packages/core/src/defaults/index.ts`
- `packages/core/src/hq/factory.ts`
- `packages/core/src/coordination/package-outdated-watcher.ts`

### CLI
- `packages/cli/src/cli-main.ts`
- `packages/cli/src/slash-commands/sdd.ts`
- `packages/cli/src/slash-commands/settings.ts`
- `packages/cli/src/slash-commands/project.ts`
- `packages/cli/src/webui-server/message-router.ts`

### TUI
- `packages/tui/src/app.tsx`
- `packages/tui/src/app-reducer.ts`
- `packages/tui/src/app-state.ts`

### WebUI
- `packages/webui/src/App.tsx`
- `packages/webui/src/components/OfficeMapCanvas.tsx`
- `packages/webui/src/components/SetupScreen.tsx`
- `packages/webui/src/components/SettingsPanel/index.tsx`

---

## Implementation principles

The following principles should govern implementation of the roadmap:

- prefer small ownership-cleanup PRs before large decomposition PRs,
- keep structural extraction separate from feature redesign,
- preserve behavior unless a PR explicitly targets a known bug,
- move shared logic out of command/UI shells before splitting those shells,
- make domain ownership and dependency direction clearer with each step,
- avoid broad, multi-concern PRs where a narrower structural slice is possible.

---

## Validation

### Core validation
```bash
pnpm --filter @wrongstack/core typecheck
pnpm test -- packages/core
pnpm test -- packages/core/tests/architecture
```

### CLI validation
```bash
pnpm --filter @wrongstack/cli typecheck
pnpm --filter @wrongstack/cli test
```

### Workspace-wide validation
```bash
pnpm typecheck
pnpm build
pnpm test
pnpm lint
```

---

## Success criteria

The refactor program should be considered successful if it results in the following outcomes:

- `@wrongstack/core/types` is restored as a true leaf export surface.
- `@wrongstack/core/defaults` becomes smaller and clearly compatibility-oriented.
- `hq/factory.ts` is reduced to HQ-specific concerns.
- non-command CLI modules no longer import shared runtime logic from `slash-commands/`.
- `cli-main.ts` becomes a top-level coordinator rather than a mixed-concern feature container.
- TUI/WebUI monoliths are reduced in focused follow-up passes.
- package ownership and import direction become easier to explain, enforce, and review.

---

## Follow-up

The recommended next implementation steps are:

1. land PR-A2,
2. land PR-A1,
3. land PR-B1,
4. land PR-B2,
5. resolve PR-B3,
6. then begin the core cleanup sequence with PR-C1 and PR-C2.

After those are complete, the next priority should be:
- `core/defaults` reduction,
- `slash-commands` service extraction,
- and `cli-main.ts` orchestration split.

This order maximizes safety and reduces the cost of later structural work.
