# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T15:33:38.301Z; skill=tech-stack; applied=2; wins=2; skipped=1; skippedWins=1 -->
- **Never treat a second lockfile as authoritative just because it shares the workspace config: verify which one CI installs with (`grep 'frozen-lockfile' .github/workflows`) before reporting lockfile drift. In a Bun-migrated pnpm repo, `pnpm-lock.yaml` can be a stale pre-migration leftover while `pnpm-workspace.yaml` stays live config read at runtime by `scripts/audit-dependencies.mjs` — report the staleness as pre-existing, not as caused by the current change.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `grep 'frozen-lockfile' .github/workflows`
  - *How:* `pnpm-lock.yaml`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `scripts/audit-dependencies.mjs`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T15:33:38.301Z; skill=node-modern; applied=3; wins=3 -->
- **Before calling new UI-package runtime dependencies bloat, compare against sibling packages first: `packages/webui`, `packages/webui-hq`, and `packages/simpleui` all declare `react`, `react-dom`, `react-markdown`, `remark-gfm`, and `lucide-react` as runtime `dependencies` even though their published `dist` is static build output, so a new package doing the same matches convention rather than introducing a regression.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `packages/webui`
  - *How:* `packages/webui-hq`
  - *How:* `packages/simpleui`
  - *How:* `react`
  - *How:* `react-dom`
  - *How:* `react-markdown`
  - *How:* `remark-gfm`
  - *How:* `lucide-react`
  - *How:* `dependencies`
  - *How:* `dist`

## Patterns to follow

<!-- learned-stamp: category=pattern; capturedAt=2026-10-17T15:33:38.301Z; skill=node-modern; applied=2; wins=2; skipped=1; skippedWins=1 -->
- **Prefer `import { Tabs } from 'radix-ui'` evidence before flagging the `radix-ui` umbrella as dead weight: grep the package for `from 'radix-ui'` and count actual primitives used, then compare the umbrella's `@radix-ui/*` dependency count (`packages/vibeui/node_modules/radix-ui/package.json` lists 57) against siblings, which import individual `@radix-ui/react-*` packages.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `import { Tabs } from 'radix-ui'`
  - *How:* `radix-ui`
  - *How:* `from 'radix-ui'`
  - *How:* `@radix-ui/*`
  - *How:* `packages/vibeui/node_modules/radix-ui/package.json`
  - *How:* `@radix-ui/react-*`
  - *How:* `@radix-ui/react-`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-07T09:18:08.894Z; skill=tech-stack; applied=3; wins=3; skipped=7; skippedWins=7 -->
- **Use pnpm's reported "Scope: all N workspace projects" count from `pnpm install --frozen-lockfile --lockfile-only` as an independent completeness check for coordinated own-version bumps — it must equal (changed member manifests + root). Together with `grep '"version": "<old>"' **/package.json` requiring zero matches, it catches both a member omitted from the bump and a newly added workspace project.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `pnpm install --frozen-lockfile --lockfile-only`
  - *How:* `grep '"version": "<old>"' **/package.json`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-08T16:40:26.483Z; skill=tech-stack; applied=3; wins=3; skipped=4; skippedWins=4 -->
- **When a Radix primitive removal looks like it orphans a shared `@radix-ui/*` internal (e.g. `@radix-ui/number`, `@radix-ui/react-use-previous`), check the other primitives before calling it dead — `grep "<dep>:1" pnpm-lock.yaml` under `snapshots:` proves whether a surviving sibling still pulls it in. A transitive entry can look orphaned purely because one consumer was pruned while a second consumer in a different workspace member remains.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `@radix-ui/*`
  - *How:* `@radix-ui/number`
  - *How:* `@radix-ui/react-use-previous`
  - *How:* `grep "<dep>:1" pnpm-lock.yaml`
  - *How:* `snapshots:`

---
*Last capture: 2026-10-17T15:33:38.301Z · 5 entries*
