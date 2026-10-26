# Dependency Agent Instructions

## Manifest/Lockfile Verification

- Gate every manifest change with `bun install --frozen-lockfile --dry-run` (exit 0 = agreement); it mirrors what CI runs (`bun install --frozen-lockfile --ignore-scripts` in `.github/workflows/*.yml`).
- Which lockfile is authoritative is decided by CI, not by shared workspace config: `grep 'frozen-lockfile' .github/workflows` before reporting lockfile drift. `pnpm-lock.yaml` is a stale pre-migration leftover, while `pnpm-workspace.yaml` stays live (read at runtime by `scripts/audit-dependencies.mjs`) — report the stale lockfile as pre-existing, never as caused by the current change.
- Token-diff `git diff --unified=0 bun.lock` (added vs removed `name@version` tokens) instead of trusting diff size: bulk same-package version swaps reveal re-resolution anomalies; tokens missing from only one side are usually dedupe-key renames — confirm with `grep '"<pkg>@'` before reporting a package as removed.

## bun.lock Diff Expectations

- Importer blocks mirror each workspace member's own `version`, so a coordinated own-version bump legitimately produces importer-only `"version"` churn — "leave bun.lock untouched" is the wrong invariant. The correct gate: the diff contains only importer-block `"version"` lines with zero external package-snapshot or `overrides:` movement, proven by the dry-run check exiting 0 plus `grep '"version": "<old>"' **/package.json` returning zero matches.
- That same gate doubles as a completeness check for coordinated bumps: it catches both a member omitted from the bump and any lockfile/manifest disagreement.
- A package extraction (e.g. `@wrongstack/agent-catalog` from `@wrongstack/core`) expects an importer-only diff: a new importer block, one `workspace:*` line per consumer, one link-map entry. Any external snapshot hunk means an unplanned dependency change.
- A `scripts`-only `package.json` change is lockfile-neutral: lockfiles record specifiers, not scripts. Verify zero churn by diffing the importer block against the manifest rather than re-running the installer.

## Workspace Overrides

- "Overrides in package.json changed since bun.lock was saved" is proof the lock was saved from a stale manifest base — diff the `overrides:` block in `bun.lock` against root `package.json` to date the base before regenerating.
- A floor tightened only in the manifest has zero effect until the lockfile regenerates; also check the resolved version entry — a manifest declaring a higher minimum can coexist with a vulnerable version resolved below it.
- An `overrides` entry is active protection only if the package also appears in the lockfile as a package entry or importer dependency; the override declaration alone is inert vestigial config — it neither fixes the vulnerability nor proves mitigation.

## Exports Subpath Wiring

- A new `exports` subpath in `packages/*/package.json` is incomplete until listed in the `coreEntries`/`toolEntries` arrays in `scripts/build-package.mjs` — the build emits only listed entries, so an unwired subpath passes CI and fails at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`, not at build time. `packages/core/tests/architecture/build-allowlist-freshness.test.ts` does NOT gate manifest/build parity.
- After moving or removing a subpath, grep for the old specifier (e.g. `@wrongstack/core/agent-catalog`) to catch orphan scripts and generated ratchet inputs; grep `packages/tools/src/` for live consumers — zero importers means dead weight, a live importer means a shipping break.

## website/ Dual Lockfile

- `website/` is both a workspace member and a standalone project deployed via `.github/workflows/pages.yml` with its own `package-lock.json` and `npm ci`. It deliberately omits `vitest` (declared only at the workspace root) so the Pages artifact stays free of test code — read the explanatory comment in `pages.yml` before reporting a missing devDependency as a phantom dep.
- Any new tooling import must be cross-checked against both trees: a config importing `vitest/config` with `environment: 'jsdom'` needs `vitest` and `jsdom` in `website/package.json` `devDependencies`, or the standalone `npm ci` tree has neither. A green `website/` test run proves nothing — Node/npm walk up the tree and silently mask missing declarations; confirm `website/node_modules/<pkg>` and `website/node_modules/.bin/<pkg>` exist.
- Keep `website/package.json`, `website/package-lock.json` (both the top-level `version` and `packages[""].version` fields), and the `website` importer in `bun.lock` synchronized. Validate both sides: the workspace dry-run plus a clean `npm ci` in `website/`.

## Registry Cooldowns

- `minimumReleaseAge` only explains versions published <24h ago. Before blaming it for lockfile downgrades, verify publish times with `npm view <pkg> time --json` — downgrades of older versions mean the resolver saw stale registry metadata or an out-of-date base lock.

## Transitive Dependency Audits

- With the isolated linker, a workspace member's dependencies install under `<member>/node_modules/…`, not the root `node_modules/` — verify newly added member packages in the member's own tree (e.g. `apps/desktop-v2/node_modules/@tauri-apps/api`) or you will false-report MISSING.
- Before flagging the `radix-ui` umbrella as dead weight, grep the package for `from 'radix-ui'` and count primitives actually used; compare its `@radix-ui/*` dependency count against siblings that import individual `@radix-ui/react-*` packages.
- Before calling a shared `@radix-ui/*` internal orphaned after removing one primitive, `grep '"@radix-ui/<dep>@'` in `bun.lock` — a surviving sibling in another workspace member may still pull it in. A transitive entry can look orphaned purely because one consumer was pruned while a second remains.