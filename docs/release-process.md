# Release Process

WrongStack ships in two halves. npm is published from the maintainer's
machine with `bun run release`; pushing a `vX.Y.Z` tag then makes
`.github/workflows/release.yml` build the GitHub Release (standalone binaries,
installers, checksums and Desktop packages). The workflow never publishes to
npm.

## npm (local)

```bash
bun run release          # release:check, then scripts/publish-workspace.mjs
bun run release:verify   # every working-tree version is live on npm?
```

`publish-workspace.mjs` publishes in dependency layers and resumes from the
registry, so a run that stops partway is finished by re-running the same
command, never by a version bump. It refuses to publish from anything but a
clean `main` checkout.

**Why not CI.** `release.yml` used to carry an OIDC trusted-publishing job. It
never worked: no trusted publisher was registered for the packages, so every
attempt ended in `ENEEDAUTH`, and a run that looked green had only skipped
versions already published locally. It was removed. The workflow keeps a
read-only `npm-verify` job that runs `publish-workspace.mjs --verify-only`
against the tagged commit and reports whether that version is live. It holds no
credential and nothing waits on it; a red result means the local publish was
skipped or incomplete.

### Package manifest consistency

`bun run release:packages` must list every publishable package without
manifest warnings. Public manifests declare `publishConfig.access: public`
consistently and do not set `publishConfig.provenance`, which would make a
local publish fail outside CI.

## The tag (GitHub Release)

Push a tag matching the root manifest version, after the npm publish:

```bash
git tag v<version> && git push origin v<version>
```

A `verify` job proves the tag matches `package.json` and is an ancestor of
`origin/main`, and pins that SHA. Every later job checks out the pinned SHA, so
a moved tag cannot change what is built.

## Standalone binaries (the primary distribution)

The same tag also builds one self-contained executable per platform — Bun
runtime, CLI, every project daemon, all surfaces and the package assets in a
single file — and publishes them as GitHub release assets. This path does not
touch npm: the `github-release` job depends on the tag checks (`verify`) and the
binary jobs only. The full `release:check` runs as the separate `gate` job,
which nothing waits on — an unrelated red suite cannot hold a binary release
back, while every shipped binary still has to pass the cross-platform smoke.

| Job | What it does |
| --- | --- |
| `binaries` | `node scripts/build-binaries.mjs` cross-compiles all targets on one Ubuntu runner, then `scripts/smoke-binary.mjs` runs the Linux x64 build |
| `binaries-smoke` | runs the same smoke on real Windows x64, Windows arm64 and macOS (arm64) runners |
| `github-release` | verifies manifest coverage and digests, then uploads `wstack-*`, `SHA256SUMS`, `install.sh`, `install.ps1` |
| `desktop` | packages and smokes Windows, Linux, macOS arm64, and macOS x64 through the reusable Desktop workflow |
| `publish-desktop` | merges and verifies package-owned checksum manifests, then attaches Desktop assets to the GitHub Release |
| `gate` | runs the full `release:check` as an independent signal; nothing waits on it |
| `npm-verify` | read-only: reports whether every publishable package is live on npm at the tagged version |

Asset upload jobs resolve the release ID through `gh release view`, which
supports both drafts and published releases. A pre-existing draft stays a
draft while verified assets are attached; publish it after reviewing the
completed uploads. Reruns compare asset names and SHA-256 digests and skip
uploads that already match.

Targets: `windows-x64`, `windows-arm64`, `linux-x64`, `linux-arm64`,
`linux-x64-musl`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`.

Build and smoke locally (Bun required):

```bash
pnpm build:binary                       # this machine's target only
node scripts/smoke-binary.mjs           # smoke it
pnpm build:binaries                     # every target → dist-bin/
```

How the binary differs from an npm install at runtime — daemon dispatch,
project-script dispatch, the extracted asset tree, "am I main" guards — is
documented once in `packages/persistence/src/standalone-binary.ts`; the entry
that implements it is `scripts/binary/entry.mjs`. Two rules for new code:

- **Dynamic imports must use literal specifiers.** `import(variable)` is
  invisible to the bundler and silently missing from the binary.
- **Locate package files through the helpers** (`moduleDirFor`,
  `wrongstackPackageJsonPath`, `daemonSpawnArgs`, `cliSpawnArgs`,
  `scriptSpawnArgs`), never through `import.meta.url` or `process.argv[1]`
  directly. A new runtime asset directory also goes into `ASSETS` in
  `scripts/build-binaries.mjs`.

## Full gate — `release:check`

A broad correctness sweep run before anything goes to npm:

```bash
bun run release:check
# ↪ pnpm audit --audit-level=moderate
#   pnpm build
#   node scripts/check-tools-package-smoke.mjs
#   pnpm check:dist-hidden
#   pnpm providers:catalog:check
#   pnpm website:tools:check
#   pnpm plugins:manifest:check
#   node scripts/check-package-contracts.mjs
#   node scripts/check-npm-package-install.mjs
#   pnpm write:build-manifest
#   pnpm check:build-manifest
#   pnpm check:architecture
#   pnpm check:test-inventory
#   pnpm check:test-skips
#   pnpm check:node-pty
#   pnpm check:rulebook
#   pnpm lint:i18n
#   pnpm typecheck:only
#   pnpm check:test-types
#   pnpm test:coverage
```

The matrix is defined in `scripts/release-check-matrix.mjs`. Its release profile
has 20 gates, including packed-package installation, catalog/projection freshness,
architecture, test inventory/skips/types, build lineage and coverage ratchets.
Full `pnpm lint` and browser smoke are separate. `ci:local` and `release:fast`
use different profiles; neither is the full release profile.

Coverage executes its configured test areas; a failed or skipped prerequisite
prevents certification. Report a full pass only after the final process exits 0
with `0 failed · 0 skipped · 20 passed`. Per-gate evidence is written under
`.reports/release-check-matrix/`. Focused tests or old logs do not certify the
current checkout.

## Narrow plugin guard — `prepublishOnly` / `test:guard`

The root manifest maps `prepublishOnly` to `pnpm test:guard`. It is useful when the root package lifecycle is invoked or when run explicitly, but it must not be described as a guaranteed hook for every recursively published child package: the public workspace package manifests do not each declare it. The full `bun run release:check` remains the actual repository-wide gate.

```bash
pnpm prepublishOnly
# ↪ pnpm test:guard
#   ↪ vitest run packages/plugins/tests/catalog.test.ts
#           packages/plugins/tests/plugin-teardown.test.ts
#           packages/plugins/tests/smoke.test.ts
```

**What it guards**:

| File | Why it matters |
|------|-----------------|
| `packages/plugins/tests/catalog.test.ts` | The plugin catalog must list every plugin exported from `src/index.ts`. A mismatch means `spec-linker` (or any other consumer) will be stale on day one. |
| `packages/plugins/tests/plugin-teardown.test.ts` | Lifecycle expectations are checked across the 63 entries in `PLUGIN_CATALOG`. |
| `packages/plugins/tests/smoke.test.ts` | All 8 historic plugin files (the original 8 from the pre-catalog era) must still import and register. Catches broken barrel exports. |

**Why a separate script?** It gives maintainers focused feedback on catalog,
lifecycle, and barrel regressions. Avoid fixed timing claims: duration varies by
machine and the full suite is much larger than this three-file selection.

## When each layer runs

| Command | What runs |
|---------|-----------|
| `pnpm release` | `release:check`, then recursive public publish |
| `pnpm release:dry` | Recursive publish dry-run only; run `release:check` separately |
| `bun run release:check` | Full repository release gate, no publication |
| `pnpm test:guard` / `pnpm prepublishOnly` | Three focused plugin tests only |
| `pnpm test` | Root Vitest suite, then the WebUI package test script |
| Tag push (`v*.*.*`) | Verify the tag/SHA; build and smoke standalone plus Desktop assets; create the GitHub Release; run the separately gated npm pack/publish path |
| Manual `CI` dispatch (`ci.yml`) | Run the repository CI jobs on the selected ref; pushes and pull requests do not start them |
| Manual `Dependency Audit` dispatch (`audit.yml`) | Run the configured dependency audit; there is no scheduled or push trigger |
| Manual `Deploy Website` dispatch (`pages.yml`) | Validate/build the website and deploy the selected ref to Pages |

Since 1.0.34, CI, dependency audit and Pages deployment use
`workflow_dispatch` only. Publishing a commit does not start those checks or
deploy the website. Dispatch them for the reviewed ref and inspect their final
results separately from the tag-triggered release workflow. Updating README,
changelog and website content prepares those surfaces; it does not establish
package publication or a live deployment.

## Adding a new guard

When the catalog grows (e.g. a new invariants test, a new
contract test) the guard list in `package.json` should be
extended:

```jsonc
{
  "scripts": {
    "test:guard": "vitest run packages/plugins/tests/catalog.test.ts packages/plugins/tests/plugin-teardown.test.ts packages/plugins/tests/smoke.test.ts packages/plugins/tests/<new-guard>.test.ts"
  }
}
```

The pattern: a guard test is **fast** (sub-second each), **specific**
(catches one well-defined class of regression), and **independent**
(doesn't depend on the plugin lifecycle state). The three
existing guards — catalog, H1 teardown, smoke — are the
baseline; new ones should match the same shape.

> The H1 teardown test enumerates every entry in
> `packages/plugins/src/catalog.ts`. The catalog itself enforces
> kebab-case names + uniqueness at module load, so any future plugin
> added to the index must also be added to the catalog — the
> `plugin-teardown.test.ts` guard catches a drift between the two.

## Why keep the focused guard

| Concern | `release:check` | `test:guard` |
|---------|-----------------|--------------|
| Type/build/audit/package-contract/i18n failures | ✅ | ❌ |
| Full test suite | ✅ | ❌ |
| Focused catalog/lifecycle/barrel feedback | Covered by full tests | ✅ |
| Guaranteed for each recursively published child | N/A | ❌ — child manifests do not declare this hook |

Do not bypass `pnpm release` on the assumption that a recursive publish will
run the root hook. For dry runs, use `bun run release:check && pnpm release:dry`.
For a real release, `pnpm release` encodes the required ordering.

## Cross-references

- [`packages/plugins/src/catalog.ts`](../packages/plugins/src/catalog.ts) — what the catalog test guards
- [`docs/feature-matrix.md`](feature-matrix.md) — the 63 plugins the H1 teardown test covers
- [`packages/plugins/README.md`](../packages/plugins/README.md) — the plugin contract
- [`release.md`](release.md) — maintainer checklist, version bump, tagging, publication, and current automation status
- [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) — website deployment only; not an npm release workflow
