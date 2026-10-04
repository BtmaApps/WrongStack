## Tool output and protected paths
- Reuse `tree`’s `~/.wrongstack/tool-output/<timestamp>-tree-*.log` when the display is clipped but `truncated=false`; grep the artifact rather than repeat the walk. Validate zero hits with a known-present control token.
- Never retry or bypass denied `read` access to `.npmrc`, `.env*`, `.pypirc`, or `.netrc`, including through `codebase-skeleton`. Check `SENSITIVE_READ_PATHS` in `packages/core/src/security/permission-helpers.ts`; use literal-path `grep` (`files_with_matches`, `truncated=false`) for guards/tests/docs and leave protected reads to the leader. Resolve pnpm settings in `pnpm-workspace.yaml`, not `.npmrc`: pnpm 12 ignores its pnpm-specific keys; npm-compatible registry/auth keys remain there.

## Ignored files and scratch probes
- Treat `.temp_files/`, `.design/`, `.reports/`, `docs/reports/`, and `docs/competitive-*/` as ignore-blind to `glob` and `codebase-*`. Prove existence with `read`/exact-directory `tree`. Pair repo-wide and explicit-directory greps with controls from the target’s body; explicit paths can still be filtered. If a control misses, invalidate that scope’s zero, stop repeating, and read candidate files directly. Report each scope separately; warn leaders that ignored edits lack Git recovery.
- For `.temp_files/*.mjs`, read the `package.json` targeted by `createRequire(...)`; verify `@playwright/test`/`vite` there, not at repository root.
- For competitive research, check `docs/reports/<project>-*-YYYY-MM-DD.md`, `docs/research/`, and `website/src/data/comparisons.ts` (`EvidenceLevel`) before assuming no prior art.

## Consumer boundaries
- Pair module-specifier and bare-symbol greps, including sibling-relative imports; inspect barrels rather than trusting `codebase-incoming-calls`. Treat generic-type `codebase-impact-analysis` results as collisions unless `callSites` confirms identity.
- Resolve sandbox through `@wrongstack/core/sandbox`: `packages/core/package.json` exports `./sandbox`; `packages/core/src/index.ts` does not. For `packages/tools`, check both `@wrongstack/tools` and subpaths such as `@wrongstack/tools/bash` against its `exports`.
- Trace `packages/kanban/src/verification/*` through `verification-context.ts`’s named re-exports. Trace `packages/webui/src/hooks/ws-handlers/*` through `packages/webui/src/hooks/ws-handlers.ts`; check `architecture/test-only-exports.json` before declaring unused `handle*` exports production API.
- Find browser-smoke fake consumers by filename stem; inspect `packages/simpleui/tests/app-browser-smoke.mjs`’s `resolve.alias` replacements, not import graphs.

## Non-code dependents
- Expect `codebase-skeleton` to return configuration verbatim. For `.github/workflows/*.yml` or `docker-compose`, use literal-path and filename greps; distinguish runtime readers, invoked files, sync comments, docs, and fixtures.
- For `docs/specs/*-sdd.md`, grep citation stems and `docs/specs` under `packages/sdd`; inspect sibling `*.task-graph.json` for synchronization, not runtime consumption.
