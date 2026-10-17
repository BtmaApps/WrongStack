# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T15:19:00.896Z; skill=codebase-navigation; applied=2; wins=2; skipped=2; skippedWins=2 -->
- **When tracing the `apps/desktop/src/main/validation/` surface, treat `schemas.ts` and `index.ts` as separately imported modules — the `index.ts` utilities barrel does not re-export `schemas.ts`, so a repo-wide module-path grep on `validation/schemas(\.js)?["']` is the complete consumer closure (do not assume the barrel aggregates the directory).**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `apps/desktop/src/main/validation/`
  - *How:* `schemas.ts`
  - *How:* `index.ts`
  - *How:* `validation/schemas(\.js)?["']`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T23:09:27.369Z; applied=28; wins=28; skipped=39; skippedWins=39 -->
- **Always check for a package-local `vitest.config.ts` before predicting how a `packages/core/tests/**` suite is collected — core has none, so the root `vitest.config.ts` `include` glob is the authoritative discovery contract.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `vitest.config.ts`
  - *How:* `packages/core/tests/**`
  - *How:* `include`

<!-- learned-stamp: category=convention; capturedAt=2026-10-16T22:48:06.028Z; skill=codebase-navigation; applied=11; wins=11; skipped=77; skippedWins=77 -->
- **Always close consumer claims for `packages/core/src/utils/*` modules with a repo-wide exported-symbol grep, not just `codebase-incoming-calls` — the `utils/index.ts` barrel (e.g. re-exporting `checkConnectivity`) hides all downstream consumers from the call graph, and `architecture/core-public-api-snapshot.json` gates the exact barrel lines as a separate blast-radius surface.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/core/src/utils/*`
  - *How:* `codebase-incoming-calls`
  - *How:* `utils/index.ts`
  - *How:* `checkConnectivity`
  - *How:* `architecture/core-public-api-snapshot.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T15:16:52.563Z; skill=codebase-navigation; applied=7; wins=7 -->
- **Always trace `apps/desktop` preload scripts as **build artifacts, not modules**: grep the `contextBridge.exposeInMainWorld` global name (e.g. `wrongstackDesktop`) to find renderer consumers, `runtime-manager-paths.ts` for load sites, and `scripts/build-package.mjs` (`entries: { preload: 'src/main/preload.ts' }` → `dist/preload/*.cjs`) for the bundle mapping — `codebase-incoming-calls` shows nothing because no module ever imports them.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `apps/desktop`
  - *How:* `contextBridge.exposeInMainWorld`
  - *How:* `wrongstackDesktop`
  - *How:* `runtime-manager-paths.ts`
  - *How:* `scripts/build-package.mjs`
  - *How:* `entries: { preload: 'src/main/preload.ts' }`
  - *How:* `dist/preload/*.cjs`
  - *How:* `codebase-incoming-calls`
  - *How:* `src/main/preload.ts`

---
*Last capture: 2026-10-17T15:19:00.896Z · 4 entries*
