# Learned instructions for `explore`

> Project-specific learning data for the `explore` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T14:19:24.533Z; skill=codebase-navigation; applied=6; wins=6; skipped=1; skippedWins=1 -->
- **Before editing any file under `.wrongstack/project-kit/<kit>/fixtures/`, always read the sibling `<kit>/kit.json` verification cases first — the kit runner copies `fixtures/` wholesale to a scratch dir and the declared tests pin exact artifact properties (e.g. `bytes: 13` per file, `scanned: 5` per directory), so a seemingly harmless content edit breaks kit verification with zero code-level references to warn you. The codebase index never covers the gitignored `.wrongstack/` tree, so the only reliable tracer for a fixture file is a repo-wide grep of its basename; `codebase-search`/`codebase-context` returning empty there is expected, not evidence of no consumers.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.wrongstack/project-kit/<kit>/fixtures/`
  - *How:* `<kit>/kit.json`
  - *How:* `fixtures/`
  - *How:* `bytes: 13`
  - *How:* `scanned: 5`
  - *How:* `.wrongstack/`
  - *How:* `codebase-search`
  - *How:* `codebase-context`

<!-- learned-stamp: category=warning; capturedAt=2026-09-28T14:16:13.402Z; applied=8; wins=8; skipped=1; skippedWins=1 -->
- **Never rely on `grep`/ripgrep to find references inside `.wrongstack/` — the directory is gitignored, so rg filters it out even when the path is passed explicitly (returns 0 matches, silently). To establish a consumer set for anything under `.wrongstack/project-kit/<kit>/`, `tree` the kit directory and read its `main.mjs` (kits are `main.mjs` exporting `run(input, ctx)` plus a `fixtures/` tree copied wholesale to a scratch dir for `@kit/` roots); also run the repo-wide grep from the tracked side to prove zero tracked-code references.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `grep`
  - *How:* `.wrongstack/`
  - *How:* `.wrongstack/project-kit/<kit>/`
  - *How:* `tree`
  - *How:* `main.mjs`
  - *How:* `run(input, ctx)`
  - *How:* `fixtures/`
  - *How:* `@kit/`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T14:22:16.748Z; applied=4; wins=4 -->
- **- Classify a `.wrongstack/project-kit/<kit>/fixtures/` file by **which kit.json list pins it** before judging edit blast radius: `scanned` pins file existence/count, `candidates`/`deleted` entries pin exact `bytes`, and `skipped` entries pin only `path`+`reason`. A protected-name fixture (e.g. `README.md` in `temp-file-sweeper`) is therefore byte-unpinned — content edits are verification-safe — while its existence, exact name, and extension are pinned by every case's `scanned` count. - Do **not** assume `rg` silently excludes the gitignored `.wrongstack/` tree: a repo-root `files_with_matches` grep for a kit name in this project returned `.wrongstack\\project-kit\\...` paths. When tracing consumers of `.wrongstack/project-kit/` content, run the repo-wide grep and treat returned hits as exhaustive — but still confirm the count/truncation flag before claiming zero tracked-code references.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `.wrongstack/project-kit/<kit>/fixtures/`
  - *How:* `scanned`
  - *How:* `candidates`
  - *How:* `deleted`
  - *How:* `bytes`
  - *How:* `skipped`
  - *How:* `path`
  - *How:* `reason`
  - *How:* `README.md`
  - *How:* `temp-file-sweeper`
  - *How:* `rg`
  - *How:* `.wrongstack/`
  - *How:* `files_with_matches`
  - *How:* `.wrongstack\\project-kit\\...`
  - *How:* `.wrongstack/project-kit/`

<!-- learned-stamp: category=convention; capturedAt=2026-09-28T08:58:23.217Z; skill=codebase-navigation; skipped=10; skippedWins=10 -->
- **Always settle "who imports this test file" with one repo-wide grep of the module specifier (`name(\.js)?['"]`) rather than `codebase-incoming-calls` — Vitest test files under `packages/*/tests/` export nothing, so there are no symbols to query, and an untruncated zero-match grep is exhaustive proof the only consumer is the test runner. The test's real coupling surface is its *imports* (`../src/*` units under test plus `tests/helpers/`), which the skeleton's import block already lists.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `name(\.js)?['"]`
  - *How:* `codebase-incoming-calls`
  - *How:* `packages/*/tests/`
  - *How:* `../src/*`
  - *How:* `tests/helpers/`

---
*Last capture: 2026-09-28T14:22:16.748Z · 4 entries*
