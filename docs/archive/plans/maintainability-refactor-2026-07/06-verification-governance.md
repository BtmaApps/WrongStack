# Verification, Migration, and Governance

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../../README.md) and current source for runtime behavior.


## Objective

Make architectural improvement enforceable. A refactor is not complete because code moved or tests happened to pass; it is complete when behavior, ownership, dependency direction, packaging, and rollback evidence all satisfy explicit gates.

**Scope:** All packages and applications except `website/` (per the 2026-07-21 scope decision).

## 1. Required verification layers

### Static verification

- production TypeScript typecheck;
- test-inclusive TypeScript ratchet;
- lint and format checks;
- package export and browser-compatibility checks;
- workspace dependency DAG;
- runtime module-cycle detection;
- type dependency-cycle detection;
- forbidden import/layer checks;
- no-new-root-barrel import ratchets;
- architecture exception validity;
- hotspot size and coupling ratchets.

### Behavioral verification

- unit tests for pure policies and reducers;
- contract/conformance tests for ports and adapters;
- characterization tests for legacy behavior;
- golden fixtures for protocol and persistence;
- integration tests for composition and lifecycle;
- top-level journeys for CLI, TUI, Director, Desktop, and browser surfaces;
- failure injection for storage, process, network, and teardown paths.

### Distribution verification

- clean-checkout build;
- pack/install smoke for every publishable package;
- export resolution from built artifacts, not source aliases;
- browser bundle Node-built-in check;
- executable wrapper smoke;
- release dry run and provenance/artifact manifest.

## 2. Architecture health registry

Create one machine-readable registry that drives human reports and CI. It should include:

- package name, tier, owner, publishability, and allowed dependencies;
- internal Core layer classification and allowed edges;
- public entrypoints and browser/Node compatibility;
- source/test ownership;
- hotspot baselines;
- architecture exceptions;
- compatibility adapters;
- canonical task IDs and status links.

Generated output should include:

- workspace DAG;
- module SCC report;
- package and layer violations;
- root-import usage;
- hotspot deltas;
- expired exceptions;
- compatibility items approaching removal date;
- expected/discovered/executed/skipped/typechecked test counts.

## 3. Temporary exception policy

Every exception record requires:

```yaml
id: ARCH-EXAMPLE-001
rule: no-runtime-cycle
scope:
  - packages/example/src/a.ts
  - packages/example/src/b.ts
owner: team-or-person
reason: concrete migration blocker
introduced: 2026-07-21
review_by: 2026-08-21
remove_when: consumer X has migrated to contract Y
canonical_task: P1
```

Rules:

1. Missing owner, date, removal condition, or task link fails CI.
2. Expired exceptions fail CI unless renewed in a reviewed change.
3. Scope widening is treated as a new exception.
4. An exception cannot raise a hotspot limit without explaining the behavioral work requiring growth.
5. Permanent exclusions must become an explicit architecture rule or ADR, not an indefinitely renewed exception.

## 4. Hotspot ratchet

Track more than line count:

- source lines;
- relative import fan-out;
- cross-domain imports;
- public exports;
- effects/callbacks for UI roots;
- reducer action families;
- number of responsibilities from the ownership inventory;
- test flake rate and journey coverage.

Policy:

- existing debt establishes the initial ceiling;
- unreviewed growth fails CI;
- a decomposition slice should reduce at least one coupling metric;
- new files inherit the normal soft cap rather than a copied legacy ceiling;
- wrappers and re-export-only files do not count as responsibility reduction.

## 5. Migration template

Every authority-changing task or PR description should contain:

### Authority

- old authority;
- new authority;
- why the new owner is lower-level or more cohesive;
- consumers being migrated in this slice.

### Compatibility

- adapter or feature flag;
- supported release window;
- usage query;
- removal task and date.

### Behavior

- characterization/golden fixtures;
- semantics that must remain identical;
- intentionally changed behavior and user impact.

### Dependency evidence

- before/after workspace edges;
- before/after module SCC result;
- new public exports and dependency compatibility.

### Rollback

- exact switch or revert boundary;
- data compatibility;
- resources that must be disposed;
- monitoring signal that triggers rollback.

### Exit evidence

- tests and counts;
- architecture report delta;
- usage scan;
- packaging/browser smoke where applicable.

## 6. Definition of done by change type

### Contract introduction

- dependency-light owner accepted;
- runtime validation where input is untrusted;
- conformance tests;
- at least one producer and consumer;
- no premature deletion of old entrypoint.

### Consumer migration

- consumer no longer imports old implementation;
- parity tests pass;
- adapter remains directional;
- rollback is demonstrated or trivial.

### Package extraction

- package DAG remains acyclic;
- package can build, test, pack, and install independently;
- no source alias is required;
- public exports are intentional;
- old package has no concrete ownership after migration.

### Hotspot split

- behavior characterized before split;
- dependency direction is one-way;
- cross-domain coupling or responsibility count decreases;
- root module becomes composition, not a forwarding god object;
- no integration flake regression.

### Compatibility removal

- deprecation period satisfied;
- repository and known external usage scans are clear;
- release notes/migration guidance exists where public;
- adapter, exception, tests, and dead exports are removed together.

## 7. Program metrics

Report per milestone rather than claiming a single maintainability score.

### Authority metrics

- duplicated protocol definitions;
- manually mirrored provider/plugin/tool lists;
- production WebUI backend implementations;
- concrete memory identity checks;
- Core product feature directories.

### Coupling metrics

- workspace and module cycles;
- Core root imports by package;
- cross-layer violations;
- UI state imports from component implementations;
- central catalog eager implementation imports.

### Hotspot metrics

- top file LOC and fan-out;
- TUI root effects and reducer action families;
- CLI main responsibilities and phase dependencies;
- Director policy families still inline;
- Super Memory services still implemented by the facade.

### Verification metrics

- expected/discovered/executed/skipped tests;
- test files included in TypeScript projects;
- clean-build reproducibility;
- package pack/install coverage;
- architecture exceptions and expired exceptions;
- compatibility adapters by age.

## 8. Review cadence

- Every refactor PR: update generated architecture evidence.
- Weekly during active waves: review exceptions, adapter age, and critical-path blockers.
- At milestone close: regenerate baseline and compare with the prior milestone using the same scanner version.
- Before release: review compatibility removals and public migration guidance.
- After two ineffective hotspot slices: apply the stop rule and revisit the seam.

## 9. Risk controls

| Risk | Control |
|---|---|
| Large move hides behavior changes | Characterization first; one behavioral seam per PR |
| New contracts become god packages | Domain subpaths, dependency rules, export/size ratchets |
| Adapters become permanent | Owner, expiry, usage query, release removal gate |
| Generated metadata hides errors | Schema validation, reviewable projections, parity tests |
| Package extraction increases complexity | Runtime pilot and kill criteria |
| UI consolidation over-shares state | Share semantic projections only; keep renderer state local |
| Concurrent work invalidates assumptions | Re-read task status, diffs, and usage immediately before edits/removals |
| Green tests miss files | Inventory-based expected/discovered/executed/typechecked counts |

## 10. Final program acceptance

The program may close when:

1. canonical graph tasks are done, superseded, or killed with accepted evidence;
2. the workspace and module graphs have no unowned cycles;
3. no expired architecture exceptions remain;
4. one authority exists for protocol, WebUI backend, memory, providers, plugins, and tool packs;
5. Core and Runtime match their accepted ownership ADR;
6. primary hosts and UI roots are thin composition/presentation shells;
7. all supported packages pass clean build, test, typecheck, and pack/install gates;
8. compatibility adapters remaining for public release support have explicit future removal releases;
9. architecture, contributor, provider, plugin, and tool documentation reflects the final structure.

## 11. Implemented Wave 0 gates (2026-07-21)

The first enforceable verification slice is now available and excludes Website:

- `pnpm check:architecture` validates package/source/test ownership, Core classifications, module-cycle exceptions, and hotspot ratchets;
- `pnpm check:test-inventory` compares all 1,734 inventoried test files with actual Vitest collection across the root Node, WebUI jsdom, and CLI HQ jsdom projects;
- `pnpm check:test-skips` blocks unreviewed additions, changes, and stale entries across all 51 current skip/run-condition declarations;
- `pnpm check:test-types` blocks new or increased test-inclusive TypeScript diagnostics while the documented baseline is burned down;
- `pnpm check:clean-dist` rejects stale in-scope build output at the start of the CI build job;
- `pnpm write:build-manifest` and `pnpm check:build-manifest` bind downstream E2E/TUI jobs to the same SHA-256-verified build artifacts.

V4 is complete: exact project collection, zero-collection/overlap failures, a reviewed skip-declaration budget, and the executed/skipped summaries from each real Vitest project are all blocking CI evidence.
