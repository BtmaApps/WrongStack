# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-18T09:54:32.146Z; skill=codebase-navigation; skipped=3; skippedWins=3 -->
- **When a fire-and-forget / floating-promise audit round resumes, start from the scratch scanner `.temp_files/core_fire_and_forget_scan/scan.mjs` (`--all` = out-of-window `[trace-caller]` hits; defaults cover `packages/{core,webui-server,cli,mcp,acp,tools}/src`) and the per-round evidence layout `.temp_files/audit-all--round*/logs/{<pkg>-scope.json,F*-before/after/verify*.json,repo-typecheck.json}` — do not rebuild a scanner or re-derive scope lists.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/core_fire_and_forget_scan/scan.mjs`
  - *How:* `--all`
  - *How:* `[trace-caller]`
  - *How:* `packages/{core,webui-server,cli,mcp,acp,tools}/src`
  - *How:* `.temp_files/audit-all--round*/logs/{<pkg>-scope.json,F*-before/after/verify*.json,repo-typecheck.json}`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T09:54:32.146Z; skill=codebase-navigation; applied=2; wins=2; skipped=1; skippedWins=1 -->
- **Verifying the "CLI suite" means two commands: `bun run test` in `packages/cli` AND `bun run test:hqdash`, because `packages/cli/vitest.config.ts` excludes `tests/hq-dashboard.test.ts` (jsdom/forks pool) and only `vitest.hqdash.config.ts` collects it — a green main run alone does not cover that file.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `bun run test`
  - *How:* `packages/cli`
  - *How:* `bun run test:hqdash`
  - *How:* `packages/cli/vitest.config.ts`
  - *How:* `tests/hq-dashboard.test.ts`
  - *How:* `vitest.hqdash.config.ts`

<!-- learned-stamp: category=convention; capturedAt=2026-10-18T10:09:47.746Z; skill=codebase-navigation; applied=1; wins=1 -->
- **When closing importers of a module whose filename is a prefix of siblings (`cli-main.ts` vs `cli-main-helpers.ts` / `cli-main-boot.ts`), anchor the grep on the import specifier — `from\s+["'][^"']*\b<module>(\.js)?["']` plus `import()`/`require()` variants — not the bare filename: substring greps flood with sibling files and `docs/reports/*.json` mentions that inflate the match count and can truncate before real importers appear.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `cli-main.ts`
  - *How:* `cli-main-helpers.ts`
  - *How:* `cli-main-boot.ts`
  - *How:* `from\s+["'][^"']*\b<module>(\.js)?["']`
  - *How:* `import()`
  - *How:* `require()`
  - *How:* `docs/reports/*.json`

---
*Last capture: 2026-10-18T10:09:47.746Z · 3 entries*
