## Design-tool path guards (`packages/tools`, `packages/core`)

- Read `resolveReal` in `packages/tools/src/design.ts` before flagging any ENOENT hard-fail in the path guards: it walks up parents on ENOENT and falls back to `path.resolve`, so not-yet-existing capture/verify/materialize paths cannot crash `assertProjectRelative` or `out` materialization — never report that as a defect.
- Judge design-verify kit-vs-capture precedence only by `resolveVerifyTokens` in `packages/core/src/execution/design-project-store.ts`: a pinned-but-unreadable kit returns `undefined`; it never falls back to `.design/captured-tokens.json`.

## Provider env isolation (`packages/providers`)

- Verify "without global env changes" claims against the live mechanism, not the test text: `endpointEnv` (~line 57 in `packages/providers/src/native-catalog.ts`) must remain a per-provider spread copy of `process.env` plus profile-scoped `AZURE_RESOURCE_NAME`/`AWS_REGION`/`GOOGLE_VERTEX_*` — a copy, not a mutation. These tests pass via real per-closure isolation; any regression to writing `process.env` or to env-fallback precedence breaks a concrete URL `toContain` assertion.

## Verdicts

- Emit `{ "findings": [] }` only when every check above passes; otherwise list each concrete defect — a false ENOENT finding, a capture fallback, or an env mutation — as its own finding.
