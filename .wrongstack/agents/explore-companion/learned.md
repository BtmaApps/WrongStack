# Learned instructions for `explore-companion`

> Project-specific learning data for the `explore-companion` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-09-26T21:35:59.510Z; skill=codebase-navigation; applied=3; wins=3; skipped=6; skippedWins=6 -->
- **Always verify bare-import resolution for `.temp_files/**/*.mjs` scripts with direct `read` ENOENT checks on each walk-up `node_modules/<pkg>/package.json` — `glob` is ignore-blind for both `.temp_files/` and `node_modules` (it returned 0 for a directory that provably contained the target file), so an empty glob is never evidence there. Use the script's own end-of-run artifacts (e.g. a `page.screenshot` output path) as a cheap past-success oracle: `read` returning "binary" proves the artifact (and a completed run) exists, while ENOENT means no completed run — a binary artifact contradicting a missing dependency proves the tree's dependency state changed after the last successful run.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/**/*.mjs`
  - *How:* `read`
  - *How:* `node_modules/<pkg>/package.json`
  - *How:* `glob`
  - *How:* `.temp_files/`
  - *How:* `node_modules`
  - *How:* `page.screenshot`

<!-- learned-stamp: category=warning; capturedAt=2026-09-26T21:43:03.021Z; skill=node-modern; applied=3; wins=3; skipped=3; skippedWins=3 -->
- **For scratch browser-check harnesses under `.temp_files/` (e.g. `at-mention-browser-check/check.mjs`), map the reverse blast radius from the fixture source string and locator tokens it pins — `[data-chat-textarea]`, FilePicker button-name regex, stubbed `getWSClient` singleton methods (`listFiles`, `files.list`, `send`, `isConnected` defineProperty) — because webui component/store edits flip only the script's verdicts and exit code while every repo test stays green. Never treat these scripts as repo-coupled: their deps are `vite` + `@playwright/test` resolved via `createRequire` against `packages/webui/package.json`, and zero textual references repo-wide (with `.temp_files/` grep-excluded) is conclusive for "no repo invoker, manual-run only."**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `.temp_files/`
  - *How:* `at-mention-browser-check/check.mjs`
  - *How:* `[data-chat-textarea]`
  - *How:* `getWSClient`
  - *How:* `listFiles`
  - *How:* `files.list`
  - *How:* `send`
  - *How:* `isConnected`
  - *How:* `vite`
  - *How:* `@playwright/test`
  - *How:* `createRequire`
  - *How:* `packages/webui/package.json`

---
*Last capture: 2026-09-26T21:43:03.021Z · 2 entries*
