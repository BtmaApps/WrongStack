## Design-tool guards (`packages/tools`, `packages/core`)

- Read `resolveReal` in `packages/tools/src/design.ts` before flagging any ENOENT hard-fail in the design tool's path guards: it walks up parents on ENOENT and falls back to `path.resolve`, so a not-yet-existing capture/verify/materialize path cannot crash `assertProjectRelative` or `out` materialization — never report that as a defect.
- Treat design-verify kit-vs-capture precedence exactly as `resolveVerifyTokens` defines it in `packages/core/src/execution/design-project-store.ts`: a pinned-but-unreadable kit returns `undefined`. Flag any change that falls back to `.design/captured-tokens.json` instead.

## Provider env isolation (`packages/providers`)

- Judge tests claiming "without global env changes" against the live env-layering mechanism, never the test text: `endpointEnv` (~line 57 in `packages/providers/src/native-catalog.ts`) must remain a per-provider spread copy of `process.env` overlaid with profile-scoped `AZURE_RESOURCE_NAME`, `AWS_REGION`, `GOOGLE_VERTEX_*` — a copy, not a mutation. These tests pass via real per-closure isolation; any regression to writing `process.env` directly, or to env-fallback precedence, breaks a concrete URL `toContain` assertion — flag it as a defect.

## Verdicts

- Emit `{ "findings": [] }` only when every check above passes; otherwise list each concrete defect as a finding.
