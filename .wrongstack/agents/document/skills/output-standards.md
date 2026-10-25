## Verification without a shell

- If no shell/exec tool is registered, read `scripts/check-docs.mjs` to identify every assertion, then verify each manually—including link-target existence and exact path casing for `scripts/check-docs.mjs`.
- Do not report the gate as passed or imply that it ran. State that the gate is unrun, list the precise substitute evidence, and identify any assertions that could not be checked.

## ACP and skill claims

- Before editing website integration pages, cross-check ACP and skill claims against `packages/acp/src/agent/protocol-handler.ts` and `docs/skills.md`. Treat these runtime/generated sources as authoritative over hand-maintained agent-catalog sizes, method counts, and frontmatter-field lists.
- Do not make exact-match edits from grep/read output alone because displayed tokens may be redacted; confirm replacement text against the unredacted source or source-backed literals.
