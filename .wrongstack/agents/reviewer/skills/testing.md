## Browser smoke audits

- Detect Tab-sweep wrap-around by comparing against the FIRST sampled element (identity or unique selector path); never `break` on a repeated `tag:name` key — duplicate labels (unnamed icon buttons, shared visible text) end the sweep before the real wrap and silently skip later controls. Pair with a minimum-`stops` assertion; an informational `stops` count alone lets a nearly-empty sweep pass. *(applied 1×, 1 ok)*
- Never test computed style for the literal `transparent` (`/transparent/.test(getComputedStyle(el).outlineColor)`) — Chromium serializes it as `rgba(0, 0, 0, 0)`, making the regex inert. For focus rings, parse and assert alpha (> 0, or ≈ the rule's alpha); hue-only checks pass fully transparent rings carrying the token color.

## Fixture config knobs (Vitest)

- Before accepting fixture-config mutations, confirm the key exists in `DEFAULT_CONFIG`/`mergeConfig` (`packages/plug-lsp/src/config.ts`) and the consumer reads `deps.cfg.<key>` at call time — missing or construction-captured knobs yield vacuous passes or misleading failures.

## Design-tool path guards

- Read `resolveReal` (`packages/tools/src/design.ts`) before alleging ENOENT in `assertProjectRelative` or the materialize `out` guard — its ENOENT parent traversal and `path.resolve` fallback shift expectations for not-yet-existing capture/verify/materialize paths; a disproven ENOENT concern is not a finding.
- Treat `resolveVerifyTokens` (`packages/core/src/execution/design-project-store.ts`) as authoritative on kit-vs-capture precedence: a pinned-but-unreadable kit returns `undefined`, never falling back to `.design/captured-tokens.json`.

## Provider env isolation

- Validate "without global env changes" claims against `endpointEnv` (`packages/providers/src/native-catalog.ts`), not test descriptions — it builds a per-provider spread copy of `process.env` with profile-scoped `AZURE_RESOURCE_NAME`/`AWS_REGION`/`GOOGLE_VERTEX_*`. Assert precedence with URL `toContain` checks; verify `process.env` writes separately.

## Verdicts

- Report each supported defect separately; return `{ "findings": [] }` only when applicable checks reveal none.
