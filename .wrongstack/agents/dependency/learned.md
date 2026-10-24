# Learned instructions for `dependency`

> Project-specific learning data for the `dependency` agent. Each entry is a directive — read it as an instruction, not a journal entry. Entries are re-derived on every capture, so this file is always a current, structured snapshot of what this agent has learned.

## What to avoid

<!-- learned-stamp: category=warning; capturedAt=2026-10-24T14:38:10.368Z; skill=tech-stack; applied=1; wins=1 -->
- **In the Bun workspace, use `bun install --frozen-lockfile --dry-run` (exit 0 = agreement) as the read-only manifest/lockfile check that mirrors what CI runs (`bun install --frozen-lockfile --ignore-scripts` in all `.github/workflows/*.yml`); do not re-run the installer against `pnpm-lock.yaml`, which is a stale pre-migration leftover. When a workspace package is extracted (e.g. `@wrongstack/agent-catalog` from `@wrongstack/core`), the expected `bun.lock` diff is importer-only — a new importer block, one dependency line per consumer, one link-map entry — with zero external snapshot movement; any external snapshot hunk means an unplanned dependency change. After the export-subpath move, grep for the removed specifier (`@wrongstack/core/agent-catalog`) to catch orphan scripts and generated ratchet inputs that still reference it.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `bun install --frozen-lockfile --dry-run`
  - *How:* `bun install --frozen-lockfile --ignore-scripts`
  - *How:* `.github/workflows/*.yml`
  - *How:* `pnpm-lock.yaml`
  - *How:* `@wrongstack/agent-catalog`
  - *How:* `@wrongstack/core`
  - *How:* `bun.lock`
  - *How:* `@wrongstack/core/agent-catalog`

<!-- learned-stamp: category=warning; capturedAt=2026-10-17T15:33:38.301Z; skill=tech-stack; applied=13; wins=13; skipped=1; skippedWins=1 -->
- **Never treat a second lockfile as authoritative just because it shares the workspace config: verify which one CI installs with (`grep 'frozen-lockfile' .github/workflows`) before reporting lockfile drift. In a Bun-migrated pnpm repo, `pnpm-lock.yaml` can be a stale pre-migration leftover while `pnpm-workspace.yaml` stays live config read at runtime by `scripts/audit-dependencies.mjs` — report the staleness as pre-existing, not as caused by the current change.**
  - *Why:* Known failure mode — skipping this has caused real defects in this codebase. The cost of getting it wrong outweighs the cost of the check.
  - *How:* `grep 'frozen-lockfile' .github/workflows`
  - *How:* `pnpm-lock.yaml`
  - *How:* `pnpm-workspace.yaml`
  - *How:* `scripts/audit-dependencies.mjs`

## What to do

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T16:19:04.318Z; skill=tech-stack -->
- **After a package extraction, token-diff `git diff --unified=0 bun.lock` (added vs removed `name@version` tokens) instead of trusting diff size: expected churn is the new importer block plus one `workspace:*` line per consumer; bulk same-package version swaps reveal re-resolution anomalies, while tokens missing from only one side are usually dedupe-key renames — confirm with a `grep '"<pkg>@'` before reporting a package as removed.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `git diff --unified=0 bun.lock`
  - *How:* `name@version`
  - *How:* `workspace:*`
  - *How:* `grep '"<pkg>@'`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T16:19:04.318Z; skill=tech-stack -->
- **Always gate any manifest change with `bun install --frozen-lockfile --dry-run` and treat "overrides in package.json changed since bun.lock was saved" as proof the lock was saved from a stale manifest base — diff the `overrides:` block in `bun.lock` against `package.json` to date the stale base before regenerating.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `bun install --frozen-lockfile --dry-run`
  - *How:* `overrides:`
  - *How:* `bun.lock`
  - *How:* `package.json`

<!-- learned-stamp: category=convention; capturedAt=2026-10-24T16:19:04.318Z; skill=tech-stack -->
- **Before blaming `minimumReleaseAge` for lockfile downgrades, verify publish times with `npm view <pkg> time --json`: the cooldown only explains versions <24h old; downgrades of older versions (e.g. `framer-motion@14.6.0`, `vscode-jsonrpc@10.0.0` published >48h earlier) mean the resolver saw stale registry metadata or an out-of-date base lock.**
  - *Why:* Established convention for this codebase — skipping it risks regressions, merge friction, or out-of-sync state with peers.
  - *How:* `minimumReleaseAge`
  - *How:* `npm view <pkg> time --json`
  - *How:* `framer-motion@14.6.0`
  - *How:* `vscode-jsonrpc@10.0.0`

<!-- learned-stamp: category=convention; capturedAt=2026-10-17T15:33:38.301Z; skill=node-modern; applied=10; wins=10; skipped=4; skippedWins=4 -->
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

<!-- learned-stamp: category=pattern; capturedAt=2026-10-17T15:33:38.301Z; skill=node-modern; applied=3; wins=3; skipped=11; skippedWins=11 -->
- **Prefer `import { Tabs } from 'radix-ui'` evidence before flagging the `radix-ui` umbrella as dead weight: grep the package for `from 'radix-ui'` and count actual primitives used, then compare the umbrella's `@radix-ui/*` dependency count (`packages/vibeui/node_modules/radix-ui/package.json` lists 57) against siblings, which import individual `@radix-ui/react-*` packages.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `import { Tabs } from 'radix-ui'`
  - *How:* `radix-ui`
  - *How:* `from 'radix-ui'`
  - *How:* `@radix-ui/*`
  - *How:* `packages/vibeui/node_modules/radix-ui/package.json`
  - *How:* `@radix-ui/react-*`
  - *How:* `@radix-ui/react-`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-07T09:18:08.894Z; skill=tech-stack; applied=4; wins=4; skipped=17; skippedWins=17 -->
- **Use `bun install --frozen-lockfile --dry-run` together with `grep '"version": "<old>"' **/package.json` requiring zero matches as an independent completeness check for coordinated own-version bumps — it catches both a member omitted from the bump and any lockfile/manifest disagreement.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `bun install --frozen-lockfile --dry-run`
  - *How:* `grep '"version": "<old>"' **/package.json`

<!-- learned-stamp: category=pattern; capturedAt=2026-10-08T16:40:26.483Z; skill=tech-stack; applied=3; wins=3; skipped=15; skippedWins=15 -->
- **When a Radix primitive removal looks like it orphans a shared `@radix-ui/*` internal (e.g. `@radix-ui/number`, `@radix-ui/react-use-previous`), check the other primitives before calling it dead — `grep '"@radix-ui/<dep>@'` in `bun.lock` proves whether a surviving sibling still pulls it in. A transitive entry can look orphaned purely because one consumer was pruned while a second consumer in a different workspace member remains.**
  - *Why:* This project's chosen approach — alternatives were considered and either conflict with existing architecture or were rejected for known reasons.
  - *How:* `@radix-ui/*`
  - *How:* `@radix-ui/number`
  - *How:* `@radix-ui/react-use-previous`
  - *How:* `bun.lock`

---
*Last capture: 2026-10-24T16:19:04.318Z · 9 entries*
