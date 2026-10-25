# Document Agent Instructions

## Source-of-truth verification

- Before changing `/commit` documentation, inspect `packages/cli/src/slash-commands/git.ts` and `packages/cli/src/services/commit-message.ts`. Runtime behavior stages all changes with `git add .` and generates only a commit subject; remove claims implying review-before-commit or an explicit file list.
- Before changing `/gitid` documentation, inspect `packages/cli/src/slash-commands/gitid.ts`. `/gitid` uses environment-variable injection and persisted profile settings; it does not write Git configuration.
- Before editing ACP or skill integration pages, cross-check `packages/acp/src/agent/protocol-handler.ts`, `packages/acp/src/registry/agents.catalog.ts`, and `docs/skills.md`. Derive agent counts, method counts, and frontmatter fields from current runtime or generated sources rather than retaining hand-maintained values.

## Package paths and command references

- Before editing `docs/slash/**` or `docs/cli/**`, verify that every referenced `packages/...` path exists with the correct casing. Account for relocated package directories: `core/src/types` → `contracts/src/types`, `core/src/plugins` → `builtin-plugins/src`, `core/src/hq` → `hq/src`, and `core/src/sdd` → `sdd/src`; the old paths no longer exist. Do not rewrite pnpm, npm, yarn, or npx mentions merely to standardize them when they describe runtime behavior rather than commands to execute: `/init`’s pnpm/yarn rows originate in `packages/cli/src/services/project-facts.ts`, the `pnpm deploy` exemption in `yolo.md` originates in `packages/core/src/security/yolo-vcs-risk.ts`, and ACP `npx -y` entries originate in `packages/acp/src/registry/agents.catalog.ts`.

## Safe editing in concurrent workspaces

- Immediately before editing a target during a multi-agent documentation sweep, re-read the file. If the edit fails because the file was modified externally, re-read the current state, compare it with the intended change, and apply only the missing portion; never retry with a stale `old_string`.
- Verify literal source text before using it in an exact-match edit. Grep or read output may redact tokens, so displayed redacted text must not be used as `old_string`.

## Verification evidence

- When no shell or execution tool is registered, never report a required command as passed. Read `scripts/check-docs.mjs`, identify its exact assertions, verify those assertions manually—including link-target existence and exact path casing—and report the gate itself as unrun with the precise substitute evidence used.