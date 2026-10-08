# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-07T09:18:08.894Z; skill=tech-stack; applied=3; wins=3 -->
- **Use pnpm's reported "Scope: all N workspace projects" count from `pnpm install --frozen-lockfile --lockfile-only` as an independent completeness check for coordinated own-version bumps — it must equal (changed member manifests + root). Together with `grep '"version": "<old>"' **/package.json` requiring zero matches, it catches both a member omitted from the bump and a newly added workspace project.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `grep '"version": "<old>"' **/package.json`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-08T16:40:26.483Z; skill=tech-stack -->
- **When a Radix primitive removal looks like it orphans a shared `@radix-ui/*` internal (e.g. `@radix-ui/number`, `@radix-ui/react-use-previous`), check the other primitives before calling it dead — `grep "<dep>:1" pnpm-lock.yaml` under `snapshots:` proves whether a surviving sibling still pulls it in. A transitive entry can look orphaned purely because one consumer was pruned while a second consumer in a different workspace member remains.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `@radix-ui/*`
  - *How:* `@radix-ui/number`
  - *How:* `@radix-ui/react-use-previous`
  - *How:* `grep "<dep>:1" pnpm-lock.yaml`
  - *How:* `snapshots:`

---
*Last capture: 2026-10-08T16:40:26.483Z · 2 entries*
