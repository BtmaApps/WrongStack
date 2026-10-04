## Fixture config knobs

- Before judging Vitest tests that mutate fixture config, verify the key exists in `DEFAULT_CONFIG`/`mergeConfig` in `packages/plug-lsp/src/config.ts` and the consumer reads `deps.cfg.<key>` at call time. Flag ineffective mutations of missing or construction-captured knobs; they can produce vacuous passes or misleading failures.

## Design-tool path guards

- Check `resolveReal` in `packages/tools/src/design.ts` before alleging ENOENT failures in `assertProjectRelative` or the materialize `out` guard. Account for its parent traversal on ENOENT and `path.resolve` fallback when testing not-yet-existing capture/verify/materialize paths.
- Use `resolveVerifyTokens` in `packages/core/src/execution/design-project-store.ts` as the authority for kit-vs-capture precedence: expect a pinned-but-unreadable kit to return `undefined`, without falling back to `.design/captured-tokens.json`.

## Provider env isolation

- Validate “without global env changes” claims against `endpointEnv` in `packages/providers/src/native-catalog.ts`, not test descriptions. Check that it builds a per-provider spread copy of `process.env` with profile-scoped `AZURE_RESOURCE_NAME` / `AWS_REGION` / `GOOGLE_VERTEX_*`; use concrete URL `toContain` assertions to check precedence, and separately check for writes to `process.env`.

## Verdicts

- Report supported defects separately; do not turn an ENOENT concern disproved by `resolveReal` into a finding. Return `{ "findings": [] }` only when the applicable checks reveal no reportable defects.
