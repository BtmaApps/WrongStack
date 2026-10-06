# Test TypeScript Debt Burn-down

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


**Baseline date:** 2026-07-21<br>
**Scope:** All packages and applications except Website<br>
**Gate:** `pnpm check:test-types`

## Baseline

All 1,734 in-scope test files belong to exactly one package `tsconfig.test.json`. The initial baseline contains 3,905 diagnostics across 22 projects; MCP and Super Memory already have zero test-type diagnostics.

The ratchet hashes the normalized project, file, TypeScript code, and message, and stores an occurrence count. A new identity or increased occurrence count fails. A resolved diagnostic is allowed and reported. Baseline files are split by package under `architecture/test-typecheck-baseline/`.

### Reviewed baseline maintenance

- **2026-07-21 — Brain contract expansion:** Test fixtures were updated to remove 55 stale diagnostics. Eight `TS6059` identities were recorded for the Tools and WebUI test projects because their known cross-package source-resolution debt now reaches the new Brain heuristic, telemetry, and rule modules. No compiler option or production contract was weakened; these identities leave with the package test-project/rootDir burn-down. WebUI's pre-expansion count was 332; the expansion added 4 TS6059 identities, bringing the total to 336. This is reflected in the per-lane counts below.

## Rules

1. Do not add `@ts-ignore`, broad `any`, unsafe casts, or weaker compiler options merely to reduce the count.
2. Fix production contract inaccuracies before changing a correct test expectation.
3. Keep test doubles structurally narrow; use `satisfies`, typed factories, and capability interfaces.
4. When a package reaches zero, delete its baseline file and make its test typecheck fully clean.
5. Remove resolved hashes in reviewed burn-down PRs; never raise counts without a documented reason.
6. Run production typecheck, package test typecheck, and affected runtime tests together.

## Recommended order

### Lane 1 — Establish zero-debt examples

1. Bench — 1 diagnostic
2. SimpleUI — 19
3. ACP — 20
4. Techstack — 20
5. WebUI HQ — 26
6. Runtime — 27
7. Kanban — 29
8. Security Scanner — 38
9. Desktop — 46

These packages provide fast feedback on factory, mock, and exact-optional-property patterns that can be reused in larger packages.

### Lane 2 — Medium packages

1. Plug-LSP — 75
2. TUI — 86
3. Telegram — 92
4. SDD — 137
5. Providers — 167
6. WebUI Server — 171

Resolve shared fixture and mock patterns before editing individual assertions repeatedly.

### Lane 3 — Large debt sets

1. WebUI — 336
2. Tools — 375
3. Plugins — 404
4. CLI — 427
5. Core — 1,413

For Core and CLI, group diagnostics by contract family and refactor task. Avoid a single mass-cast PR. Relevant families include Context/event DTOs, plugin contracts, slash-command contexts, WebUI backend types, provider definitions, and memory ports.

## Per-package exit gate

- package production typecheck passes;
- package `tsconfig.test.json` returns zero diagnostics;
- affected runtime tests pass;
- no compiler option is weakened;
- no new suppressions or unsafe compatibility casts are added;
- package baseline JSON is removed;
- `pnpm check:test-types` reports the full reduction with zero new diagnostics.

## Program exit gate

The final baseline directory contains only its README, every test project returns zero, and `check:test-types` changes from a debt ratchet to a normal zero-error TypeScript gate without compatibility behavior.
