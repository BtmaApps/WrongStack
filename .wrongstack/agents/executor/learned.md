# Learned instructions for `executor`

> Project-specific learning data for the `executor` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-09-29T07:23:54.131Z; skill=testing; skipped=13; skippedWins=13 -->
- **Always invoke `vitest` and `biome` in this repo through `pnpm exec <tool>` with `cwd` set to the package directory — the wrapper tools (`test`, `lint`, `format`) fail with "Executable not found in $PATH" because nothing is on the global PATH in this pnpm monorepo. For per-hunk review of working-tree changes, use `git diff -- <files>` via `exec`; the `diff` tool's files-only mode returns line-numbered dumps, not hunks.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `vitest`
  - *How:* `biome`
  - *How:* `pnpm exec <tool>`
  - *How:* `cwd`
  - *How:* `test`
  - *How:* `lint`
  - *How:* `format`
  - *How:* `git diff -- <files>`
  - *How:* `exec`
  - *How:* `diff`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-04T11:24:40.426Z; applied=2; wins=2; skipped=5; skippedWins=5 -->
- **Always verify OSS project "activity" from the fetched README alongside GitHub API flags when writing review reports — `archived: false` and a recent `pushed_at` can coexist with an explicit "read-only / no longer maintained" notice, so API metadata alone overstates liveness. Fetch `https://api.github.com/repos/<org>/<repo>` plus `https://raw.githubusercontent.com/<org>/<repo>/HEAD/README.md` and prefer the README's own maintenance statement for the verdict.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `archived: false`
  - *How:* `pushed_at`
  - *How:* `https://api.github.com/repos/<org>/<repo>`
  - *How:* `https://raw.githubusercontent.com/<org>/<repo>/HEAD/README.md`
  - *How:* `HEAD/README.md`

---
*Last capture: 2026-10-04T11:24:40.426Z · 2 entries*
