## TypeScript and website checks

- Treat `scripts/check-test-typecheck.mjs` as a non-regression ratchet, not proof of clean test typechecking. Inspect `architecture/test-typecheck-baseline/*.json` and run each package’s `tsconfig.test.json` directly before claiming TypeScript integrity.
- Keep `website/package.json`, `website/package-lock.json`, and the `website` importer in `pnpm-lock.yaml` synchronized. Verify the workspace with `pnpm install --frozen-lockfile` and the standalone site with `npm ci` in `website/`.

## Version and lockfile checks

- After a coordinated own-version bump under `packages/*/package.json`, sweep `**/package.json` with `grep '"version": "<old>"'` and require zero matches. Run `pnpm install --frozen-lockfile --lockfile-only`, then compare the `pnpm-lock.yaml` SHA-256 before and after; require exit 0 and an unchanged hash. Workspace own-version changes should not alter `pnpm-lock.yaml`.
- Keep `website/package-lock.json` in lockstep for workspace releases: update both its top-level `version` and `packages[""].version`; do not infer this requirement from the intentionally unchanged pnpm lockfile.

## Workspace links

- For a `"workspace:*"` dependency added to an existing `packages/*` member, expect an importer-only `pnpm-lock.yaml` diff (typically three lines) with no snapshot movement. Confirm `packages/<name>/package.json` exists and its `name` matches, and grep the consuming package’s source for imports of that package name.
