# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-07T09:18:08.894Z; skill=tech-stack; applied=1; wins=1 -->
- **Use pnpm's reported "Scope: all N workspace projects" count from `pnpm install --frozen-lockfile --lockfile-only` as an independent completeness check for coordinated own-version bumps — it must equal (changed member manifests + root). Together with `grep '"version": "<old>"' **/package.json` requiring zero matches, it catches both a member omitted from the bump and a newly added workspace project.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `grep '"version": "<old>"' **/package.json`

---
*Last capture: 2026-10-07T09:18:08.894Z · 1 entries*
