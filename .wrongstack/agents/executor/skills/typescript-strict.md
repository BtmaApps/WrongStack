## `/mcp` Render Ownership

- Trace `/mcp` output to `renderList` in `packages/cli/src/services/mcp-management.ts`. Treat `packages/cli/src/slash-commands/mcp-utils.ts` as a deprecated pure re-export; change the service, not the wrapper.

## Windows Checks

- Run repo-wide checks with `pnpm exec <tool> ... > .temp_files\<name>.log 2>&1`, then inspect using `type`/`findstr`. Do not use `tail`, `grep` pipes, `/d/...` `cd` paths, or bare `tsc`/tool names.

## Shared-Tree Testing

- Write new tests first and confirm they fail before implementing. Avoid stash/revert red-green proof on shared hot files because concurrent writes can lose changes.
