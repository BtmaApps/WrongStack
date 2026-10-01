## Evidence discipline

- Never infer file absence from a zero-hit content `grep`; it matches contents, not filenames. Confirm absence with a direct `read` showing ENOENT and an exact-directory `tree` with `truncated=false`, such as `packages/webui-server/tests`.

## Vitest topology

- Derive `packages/webui-server` suite behavior from live `packages/webui-server/vitest.config.ts`: one project, `environment: 'node'`, `include: ['tests/**/*.test.ts']`, and coverage thresholds `/statements 76`, `/functions 69`, `/branches 66`. Do not import the `packages/webui` split (`tests/server/**` → `server-node`, `browser-jsdom`).
- When tracing `start-http-server*`, distinguish responsibilities: `startHttpServer` is exported by `packages/webui-server/src/server/server-runtime.ts`, while `http-server.ts` owns `allowedHostnames` and consumes it as `trustedHostnames`. Allowed-hostnames coverage is in `packages/webui-server/tests/ws-auth.test.ts` and `packages/webui-server/tests/frontend-static-serve.test.ts`, not `packages/webui-server/tests/http-server.test.ts`.

## Partial mocks

- For `vi.mock('<specifier>', importOriginal => ({...spread, overridden}))`, verify the mocked specifier independently from the dynamic-import target `import('../src/server/server-runtime.js')`. A stale mock specifier can silently run the real implementation; in `packages/webui-server/tests/start-http-server-allowed-hostnames.test.ts`, that means binding port 3456 rather than testing option threading.

## Root manifest dependencies

- Classify root `package.json` access by role: `scripts/bump-version.mjs` (`collectManifests()`) solely writes root `version`; `scripts/build-portable.mjs`, `scripts/test-affected.mjs` (`SALT_FILES`), and `scripts/release-check-matrix.mjs` read root-manifest content.
- Establish completeness with a literal `'package.json'` content grep over `scripts/` (`output_mode: content`, `truncated=false`) and zero-hit greps of root `vitest*.ts` and `playwright.config.ts`. Ignore per-package `packageJson` paths such as `scripts/build-package.mjs` and `src/version.ts`.
- Read workspace membership from `pnpm-workspace.yaml`; do not infer it from a `workspaces` field.
