## Browser smoke audits

- Detect Tab-sweep wrap-around by comparing against the FIRST sampled element (element identity or a unique selector path); never `break` on a repeated `tag:name` key — duplicate labels (unnamed icon buttons, shared visible text) end the sweep before the real wrap and silently skip later controls. Pair this with a minimum-`stops` assertion; an informational `stops` count alone lets a nearly-empty sweep pass. *(applied 1×, 1 ok)*
- Never assert computed style for the literal keyword `transparent` (e.g. `/transparent/.test(getComputedStyle(el).outlineColor)`) — Chromium serializes it as `rgba(0, 0, 0, 0)`, so the regex is inert. When auditing visible focus rings, parse and assert alpha (> 0, or ≈ the rule's alpha); hue-only comparisons accept fully transparent rings that carry the token color.

## Fixture config knobs

- Before accepting Vitest tests that mutate fixture config, verify the key exists in `DEFAULT_CONFIG`/`mergeConfig` in `packages/plug-lsp/src/config.ts` and that the consumer reads `deps.cfg.<key>` at call time; flag ineffective mutations of missing or construction-captured knobs — they yield vacuous passes or misleading failures.

## Design-tool path guards

- Check `resolveReal` in `packages/tools/src/design.ts` before alleging ENOENT failures in `assertProjectRelative` or the materialize `out` guard; its parent traversal on ENOENT and `path.resolve` fallback change expectations for not-yet-existing capture/verify/materialize paths.
- Treat `resolveVerifyTokens` in `packages/core/src/execution/design-project-store.ts` as the authority for kit-vs-capture precedence: expect a pinned-but-unreadable kit to return `undefined`, with no fallback to `.design/captured-tokens.json`.

## Provider env isolation

- Validate "without global env changes" claims against `endpointEnv` in `packages/providers/src/native-catalog.ts`, not test descriptions: it builds a per-provider spread copy of `process.env` with profile-scoped `AZURE_RESOURCE_NAME` / `AWS_REGION` / `GOOGLE_VERTEX_*`. Use concrete URL `toContain` assertions to check precedence, and check for writes to `process.env` separately.

## Verdicts

- Report supported defects separately; do not convert an ENOENT concern disproved by `resolveReal` into a finding. Return `{ "findings": [] }` only when the applicable checks reveal no reportable defects.
