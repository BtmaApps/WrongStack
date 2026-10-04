## Design-tool path guards

- Before flagging any ENOENT hard-fail in the design tool, read `resolveReal` in `packages/tools/src/design.ts`: it walks up parents on ENOENT and falls back to `path.resolve`, so not-yet-existing capture/verify/materialize paths never crash `assertProjectRelative` or the materialize `out` guard — do not report that as a defect.
- Judge design-verify kit-vs-capture precedence solely by `resolveVerifyTokens` in `packages/core/src/execution/design-project-store.ts`: a pinned-but-unreadable kit returns `undefined` and must not fall back to `.design/captured-tokens.json`.

## Provider env isolation

- Verify any test claiming "without global env changes" against `endpointEnv` in `packages/providers/src/native-catalog.ts` (~line 57), not the test text: it must stay a per-provider spread copy of `process.env` plus profile-scoped `AZURE_RESOURCE_NAME` / `AWS_REGION` / `GOOGLE_VERTEX_*`. These tests pass via real per-closure isolation — a regression to writing `process.env` or to env-fallback precedence breaks a concrete URL `toContain` assertion.

## Verdicts

- Emit `{ "findings": [] }` only when every check above holds; otherwise list each concrete defect — a false ENOENT, a capture fallback, or an env mutation — as its own finding.
