# Dependency Audit — WrongStack (2026-09-15, source-only)

## Dependency Audit Summary
- Total dependencies: **1,570** resolved package entries in `pnpm-lock.yaml` (direct + transitive; per-importer direct split not recomputed)
- Ecosystems scanned: npm (pnpm workspace). `website/package-lock.json` (npm) is a separate docs site, not shipped with the CLI.
- Known vulnerabilities found: **not determined in this run** — `needs_validation` (see DEP-NV-001)
- Typosquatting risks: 0 observed in the delta (new direct deps are first-party `@ai-sdk/*` provider packages and Babel 8 majors)
- Dependency confusion risks: 0 — all internal packages are `@wrongstack/*` scoped and resolved `workspace:*`; `.npmrc` sets no alternate registry
- Exotic sources: 0 — no `git+`, `github:`, `tarball:`, or codeload resolutions in the lockfile
- License concerns: not re-evaluated (unchanged posture vs 2026-09-10)
- Outdated dependencies: not evaluated (requires registry metadata)

## Supply-chain controls (verified in source)
| Control | Evidence | Status |
|---|---|---|
| Install cooldown | `pnpm-workspace.yaml:75` `minimumReleaseAge: 1440` | holds |
| Cooldown excludes are live (not pre-authorized holes) | `@agentclientprotocol/sdk@1.4.0` and `@datadog/pprof@5.18.1` both present in `pnpm-lock.yaml` | holds |
| Lifecycle-script allowlist | `onlyBuiltDependencies: [electron-winstaller, esbuild, node-pty]` (`pnpm-workspace.yaml:66-69`) with dated review notes; freshness test `packages/core/tests/architecture/build-allowlist-freshness.test.ts` | holds |
| Patched dependency | `patches/ink@7.1.1.patch` (first-party patch, reviewed in prior audits) | holds |
| CI audit gate | `.github/workflows/audit.yml` — `pnpm audit --audit-level high` on manifest/lockfile change + weekly; PR cannot add its own `ignoreGhsas` (`scripts/check-audit-suppressions.mjs` vs base SHA) | holds (changed +31 lines since baseline, reviewed) |
| Release pipeline | `.github/workflows/release.yml` unchanged since baseline; OIDC + reviewed `npm-publish` environment; SHA-pinned actions; build-in-publish-job is a documented accepted risk (SECURITY.md M13) | carried |
| Container base | `deploy/hq/Dockerfile` pins `node:22.23.2-bookworm-slim@sha256:83f487e0…` multi-arch index digest (new since baseline) | holds |

## Delta since baseline `3984ebef1`
- `pnpm-lock.yaml` +/− 3,319 lines. Notable: `@ai-sdk/*` provider family added/bumped (anthropic, azure, bedrock, cohere, deepseek, google, google-vertex, openai, openai-compatible, gateway 4.0.62→4.0.79), `@babel/*` 7.29 → 8.0.5 (dev/build tooling), `@biomejs/biome` 2.5.10 → 2.5.13 (dev).
- No new entries in `onlyBuiltDependencies`; no new exotic resolutions.

## Findings

### DEP-NV-001: Advisory status of the updated lockfile not established — `needs_validation`
- **Why unresolved:** source-only validation was selected; `pnpm audit` sends the dependency graph to the npm registry (external call), so it was not run. The last known result (2026-09-10) was 0 advisories on the prior lockfile; ~3.3k lockfile lines have changed since.
- **Blocker:** registry advisory data.
- **Owner check:** `pnpm audit --audit-level low` on `ed3689988` (the CI `audit.yml` job already runs `--audit-level high` on push to main; confirm its latest run on this SHA is green).

No confirmed dependency findings.
